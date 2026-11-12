//! # Millbrook economy ledger (on-chain shell)
//!
//! Millbrook's town holds a **fixed 10,000 coins**. Every coin lives in exactly
//! one account inside this contract and only ever *moves* between accounts —
//! there is no way to create or destroy a coin after the season is seeded. That
//! is the whole point: the economy is real because the supply is real and
//! provably fixed on-chain.
//!
//! ## What this contract guarantees
//!
//! 1. **Fixed supply.** The seed must sum to exactly [`TOTAL_COINS`]. There is
//!    no `mint`, no `burn`, and no method that changes a balance except a
//!    conservation-preserving [`Contract::settle`].
//! 2. **Settlement conserves.** `settle` applies a batch of transfers; each
//!    debits one account and credits another by the same amount, and an
//!    overdraw is refused. After the batch the contract re-sums every balance
//!    and panics (reverting the whole call) if the total is no longer 10,000.
//! 3. **Only the operator settles.** The operator is set once at deploy and can
//!    never be changed. Anyone else is rejected.
//! 4. **No admin key.** There is deliberately no owner method, no upgrade/
//!    migrate method, no pause, and no mint. The operator's *only* power is to
//!    move coins in a way that preserves the total.
//!
//! All of the economic logic is the pure `millbrook-ledger` crate; this file is
//! the thin on-chain shell that reads the caller, persists state, and emits
//! events.
//!
//! Goods (bread, cloth, tools…) are a separate ledger: produced and consumed,
//! so minted and burned — but they are **not coins** and never count toward the
//! 10,000 total.
//!
//! Account ids are the simulation's internal ids (`r0`..`r29` residents, `w0`..
//! workshops, `coop`, `townhall`), held as opaque strings. Every move emits an
//! on-chain event, so "Follow a coin" needs no separate indexer.

use std::collections::BTreeMap;

use millbrook_ledger as ledger;
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{assert_one_yocto, env, near, require, AccountId, PanicOnDefault};

pub use ledger::TOTAL_COINS;

const EVENT_STANDARD: &str = "millbrook";
const EVENT_VERSION: &str = "1.0.0";

/// The NEP-245 (multi-token) standard this contract's goods implement.
const MT_STANDARD: &str = "nep245";
const MT_VERSION: &str = "1.0.0";

/// A NEP-245 token type. For Millbrook's goods the holders are many (bread is
/// held by every account that bought a loaf), so there is no single `owner_id`.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct Token {
    pub token_id: String,
    pub owner_id: Option<AccountId>,
}

/// NEP-245 contract-level metadata.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct MtContractMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
}

/// One conservation-preserving move of coins. The server batches a game day's
/// wages, sales and raw-material payments into a `Vec<Transfer>` and settles
/// them at dusk.
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Transfer {
    pub from: String,
    pub to: String,
    pub amount: u64,
}

/// One good moving between accounts (not coins — see module docs).
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct ItemTransfer {
    pub from: String,
    pub to: String,
    pub good: String,
    pub amount: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    /// The only account allowed to settle. Set once at deploy, immutable.
    operator: AccountId,
    /// The fixed supply this contract was seeded with (always [`TOTAL_COINS`]).
    total_supply: u64,
    /// Running total of all coin balances; always equals `total_supply`.
    circulating: u64,
    settlement_count: u64,
    transfer_count: u64,
    /// account id -> coin balance. Tiny (≈50 accounts), so a plain map in state.
    coins: BTreeMap<String, u64>,
    /// "account|good" -> quantity held. Goods, not coins.
    items: BTreeMap<String, u64>,
}

#[near]
impl Contract {
    /// Deploy the ledger. `seed` is the starting split of the 10,000 coins over
    /// every account; it must sum to exactly [`TOTAL_COINS`] with no duplicates.
    /// There is no second initializer and no migrate method: the operator and
    /// the supply are fixed for the life of the contract.
    #[init]
    pub fn new(operator: AccountId, seed: Vec<(String, u64)>) -> Self {
        require!(!env::state_exists(), "Already initialized");
        let coins = ledger::seed_balances(&seed).unwrap_or_else(|e| env::panic_str(&e));
        let supply = ledger::total(&coins);
        Self {
            operator,
            total_supply: supply,
            circulating: supply,
            settlement_count: 0,
            transfer_count: 0,
            coins,
            items: BTreeMap::new(),
        }
    }

    // ── Settlement (operator only) ────────────────────────────────────────────

    /// Apply a batch of coin transfers. Operator only. A batch that would
    /// overdraw any account is rejected and the whole call reverts. Returns the
    /// new settlement index.
    pub fn settle(&mut self, transfers: Vec<Transfer>) -> u64 {
        self.assert_operator();
        require!(!transfers.is_empty(), "Empty batch");

        for t in transfers.iter() {
            ledger::apply_transfer(&mut self.coins, &t.from, &t.to, t.amount)
                .unwrap_or_else(|e| env::panic_str(&e));
            self.transfer_count += 1;
        }

        // Defence-in-depth: transfers conserve by construction, but prove it
        // every time rather than trust it.
        let audited = ledger::total(&self.coins);
        require!(
            audited == self.total_supply,
            "Coin invariant broken: total changed"
        );
        self.circulating = audited;

        self.settlement_count += 1;
        self.log_event(
            "settle",
            json!({
                "settlement": self.settlement_count,
                "transfers": transfers,
                "total": self.total_supply,
            }),
        );
        self.settlement_count
    }

    // ── Goods / minimal multi-token ledger (operator only) ────────────────────

    /// Produce goods into an account (a workshop's daily output). Never touches
    /// the 10,000 coin total.
    pub fn produce(&mut self, account: String, good: String, amount: u64) {
        self.assert_operator();
        ledger::produce(&mut self.items, &account, &good, amount)
            .unwrap_or_else(|e| env::panic_str(&e));
        // NEP-245 mint event: these goods are new multi-tokens.
        self.log_mt_event(
            "mt_mint",
            json!([{
                "owner_id": account,
                "token_ids": [good],
                "amounts": [amount.to_string()],
            }]),
        );
    }

    /// Consume goods from an account (bread eaten, cloth worn).
    pub fn consume(&mut self, account: String, good: String, amount: u64) {
        self.assert_operator();
        ledger::consume(&mut self.items, &account, &good, amount)
            .unwrap_or_else(|e| env::panic_str(&e));
        // NEP-245 burn event: the goods left circulation (bread eaten, cloth worn).
        self.log_mt_event(
            "mt_burn",
            json!([{
                "owner_id": account,
                "token_ids": [good],
                "amounts": [amount.to_string()],
            }]),
        );
    }

    /// Anchor a Game Master receipt on-chain (operator only). The OutLayer
    /// enclave decides an event and produces a receipt hash over its inputs and
    /// decision; recording it here emits an on-chain event so the "Why did this
    /// happen?" card can prove the decision was not changed after the fact. This
    /// touches no balance and no goods — it only logs.
    pub fn record_receipt(&mut self, event_id: String, day: u64, receipt_hash: String) {
        self.assert_operator();
        self.log_event(
            "gm_receipt",
            json!({ "event": event_id, "day": day, "receiptHash": receipt_hash }),
        );
    }

    /// Move goods between accounts (a sale's delivery). Operator-batched so the
    /// normal game loop needs no per-player signatures or gas.
    pub fn transfer_items(&mut self, moves: Vec<ItemTransfer>) {
        self.assert_operator();
        require!(!moves.is_empty(), "Empty item batch");
        for m in moves.iter() {
            ledger::transfer_item(&mut self.items, &m.from, &m.to, &m.good, m.amount)
                .unwrap_or_else(|e| env::panic_str(&e));
        }
        // NEP-245 transfer event, one entry per move in the batch.
        let data: Vec<_> = moves
            .iter()
            .map(|m| {
                json!({
                    "old_owner_id": m.from,
                    "new_owner_id": m.to,
                    "token_ids": [m.good],
                    "amounts": [m.amount.to_string()],
                })
            })
            .collect();
        self.log_mt_event("mt_transfer", json!(data));
    }

    // ── NEP-245 multi-token standard (goods) ──────────────────────────────────
    //
    // The goods ledger above IS a NEP-245 multi token: one contract holds every
    // item type, each `token_id` is a good ("bread", "cloth", …), and balances
    // are per account. These methods expose the standard surface so any NEP-245
    // wallet or indexer can read and move items, while the game's own loop keeps
    // using the operator-batched `transfer_items` (so players never sign or pay
    // gas). Amounts are `U128` per the standard; goods are whole units.

    /// NEP-245 single transfer: the caller sends their own `amount` of one
    /// `token_id` to `receiver_id`. Requires one yoctoNEAR (full-access-key
    /// confirmation). Approvals are not supported — a holder moves their own.
    #[payable]
    pub fn mt_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
    ) {
        assert_one_yocto();
        require!(approval.is_none(), "Approval management is not supported");
        let sender = env::predecessor_account_id();
        let amt = Self::to_units(amount);
        ledger::transfer_item(&mut self.items, sender.as_str(), receiver_id.as_str(), &token_id, amt)
            .unwrap_or_else(|e| env::panic_str(&e));
        self.log_mt_transfer(sender.as_str(), receiver_id.as_str(), &[token_id], &[amt], memo);
    }

    /// NEP-245 batch transfer: several token types in one call.
    #[payable]
    pub fn mt_batch_transfer(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<(AccountId, u64)>>>,
        memo: Option<String>,
    ) {
        assert_one_yocto();
        require!(approvals.is_none(), "Approval management is not supported");
        require!(
            token_ids.len() == amounts.len() && !token_ids.is_empty(),
            "token_ids and amounts must be non-empty and the same length"
        );
        let sender = env::predecessor_account_id();
        let units: Vec<u64> = amounts.iter().map(|a| Self::to_units(*a)).collect();
        for (tid, amt) in token_ids.iter().zip(units.iter()) {
            ledger::transfer_item(&mut self.items, sender.as_str(), receiver_id.as_str(), tid, *amt)
                .unwrap_or_else(|e| env::panic_str(&e));
        }
        self.log_mt_transfer(sender.as_str(), receiver_id.as_str(), &token_ids, &units, memo);
    }

    /// NEP-245: balance of one token for one account.
    pub fn mt_balance_of(&self, account_id: AccountId, token_id: String) -> U128 {
        U128(self.item_units(account_id.as_str(), &token_id) as u128)
    }

    /// NEP-245: balances of several tokens for one account.
    pub fn mt_batch_balance_of(&self, account_id: AccountId, token_ids: Vec<String>) -> Vec<U128> {
        token_ids
            .iter()
            .map(|t| U128(self.item_units(account_id.as_str(), t) as u128))
            .collect()
    }

    /// NEP-245: total supply of one token, or `null` if the token is unknown.
    pub fn mt_supply(&self, token_id: String) -> Option<U128> {
        ledger::item_supply_opt(&self.items, &token_id).map(|s| U128(s as u128))
    }

    /// NEP-245: total supplies of several tokens.
    pub fn mt_batch_supply(&self, token_ids: Vec<String>) -> Vec<Option<U128>> {
        token_ids
            .iter()
            .map(|t| ledger::item_supply_opt(&self.items, t).map(|s| U128(s as u128)))
            .collect()
    }

    /// NEP-245: token info for each id (`null` for an unknown token). Goods have
    /// many holders, so `owner_id` is always `null`.
    pub fn mt_token(&self, token_ids: Vec<String>) -> Vec<Option<Token>> {
        token_ids
            .iter()
            .map(|t| {
                ledger::item_supply_opt(&self.items, t).map(|_| Token {
                    token_id: t.clone(),
                    owner_id: None,
                })
            })
            .collect()
    }

    /// Every token type the contract holds (enumeration).
    pub fn mt_tokens(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<Token> {
        let start = from_index.unwrap_or(0) as usize;
        let take = limit.unwrap_or(100) as usize;
        ledger::distinct_goods(&self.items)
            .into_iter()
            .skip(start)
            .take(take)
            .map(|token_id| Token {
                token_id,
                owner_id: None,
            })
            .collect()
    }

    /// The `(token_id, balance)` goods one account holds (enumeration).
    pub fn mt_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<(String, U128)> {
        let start = from_index.unwrap_or(0) as usize;
        let take = limit.unwrap_or(100) as usize;
        ledger::goods_of(&self.items, account_id.as_str())
            .into_iter()
            .skip(start)
            .take(take)
            .map(|(good, qty)| (good, U128(qty as u128)))
            .collect()
    }

    /// NEP-245 contract metadata.
    pub fn mt_metadata(&self) -> MtContractMetadata {
        MtContractMetadata {
            spec: "mt-1.0.0".to_string(),
            name: "Millbrook Goods".to_string(),
            symbol: "MILL".to_string(),
        }
    }

    // ── Views ────────────────────────────────────────────────────────────────

    /// The settlement operator (immutable).
    pub fn get_operator(&self) -> AccountId {
        self.operator.clone()
    }

    /// The fixed supply (always 10,000).
    pub fn total_supply(&self) -> u64 {
        self.total_supply
    }

    /// The maintained running total of all balances.
    pub fn circulating_supply(&self) -> u64 {
        self.circulating
    }

    /// Independently re-sum every balance. The Proof panel shows this equals
    /// 10,000 — a live on-chain audit, not a stored number to trust.
    pub fn audit_total(&self) -> u64 {
        ledger::total(&self.coins)
    }

    /// Coins held by one account.
    pub fn balance_of(&self, account: String) -> u64 {
        *self.coins.get(&account).unwrap_or(&0)
    }

    /// How many accounts hold coins.
    pub fn account_count(&self) -> u64 {
        self.coins.len() as u64
    }

    /// A page of `(account, balance)` for the Proof panel.
    pub fn balances(&self, from_index: u64, limit: u64) -> Vec<(String, u64)> {
        self.coins
            .iter()
            .skip(from_index as usize)
            .take(limit as usize)
            .map(|(k, v)| (k.clone(), *v))
            .collect()
    }

    /// Goods held by one account.
    pub fn item_balance(&self, account: String, good: String) -> u64 {
        *self
            .items
            .get(&ledger::item_key(&account, &good))
            .unwrap_or(&0)
    }

    /// Settlement batches applied so far.
    pub fn settlement_count(&self) -> u64 {
        self.settlement_count
    }

    /// Individual coin transfers applied so far.
    pub fn transfer_count(&self) -> u64 {
        self.transfer_count
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    fn assert_operator(&self) {
        ledger::authorize(
            env::predecessor_account_id().as_str(),
            self.operator.as_str(),
        )
        .unwrap_or_else(|e| env::panic_str(&e));
    }

    /// Goods are whole units; narrow a NEP-245 `U128` amount to the ledger's u64,
    /// refusing anything that would not fit (far beyond any real quantity).
    fn to_units(amount: U128) -> u64 {
        u64::try_from(amount.0).unwrap_or_else(|_| env::panic_str("Amount out of range"))
    }

    /// The quantity of one good held by one account.
    fn item_units(&self, account: &str, good: &str) -> u64 {
        *self.items.get(&ledger::item_key(account, good)).unwrap_or(&0)
    }

    fn log_event(&self, event: &str, data: near_sdk::serde_json::Value) {
        let payload = json!({
            "standard": EVENT_STANDARD,
            "version": EVENT_VERSION,
            "event": event,
            "data": data,
        });
        env::log_str(&format!("EVENT_JSON:{}", payload));
    }

    /// Emit a NEP-245 standard event (`data` is the standard's array of entries).
    fn log_mt_event(&self, event: &str, data: near_sdk::serde_json::Value) {
        let payload = json!({
            "standard": MT_STANDARD,
            "version": MT_VERSION,
            "event": event,
            "data": data,
        });
        env::log_str(&format!("EVENT_JSON:{}", payload));
    }

    /// Emit a NEP-245 `mt_transfer` event for one sender→receiver move of one or
    /// more token types.
    fn log_mt_transfer(&self, old: &str, new: &str, token_ids: &[String], amounts: &[u64], memo: Option<String>) {
        let amounts_s: Vec<String> = amounts.iter().map(|a| a.to_string()).collect();
        self.log_mt_event(
            "mt_transfer",
            json!([{
                "old_owner_id": old,
                "new_owner_id": new,
                "token_ids": token_ids,
                "amounts": amounts_s,
                "memo": memo,
            }]),
        );
    }
}
