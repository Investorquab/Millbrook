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
use near_sdk::serde_json::json;
use near_sdk::{env, near, require, AccountId, PanicOnDefault};

pub use ledger::TOTAL_COINS;

const EVENT_STANDARD: &str = "millbrook";
const EVENT_VERSION: &str = "1.0.0";

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
        self.log_event(
            "produce",
            json!({ "account": account, "good": good, "amount": amount }),
        );
    }

    /// Consume goods from an account (bread eaten, cloth worn).
    pub fn consume(&mut self, account: String, good: String, amount: u64) {
        self.assert_operator();
        ledger::consume(&mut self.items, &account, &good, amount)
            .unwrap_or_else(|e| env::panic_str(&e));
        self.log_event(
            "consume",
            json!({ "account": account, "good": good, "amount": amount }),
        );
    }

    /// Move goods between accounts (a sale's delivery).
    pub fn transfer_items(&mut self, moves: Vec<ItemTransfer>) {
        self.assert_operator();
        require!(!moves.is_empty(), "Empty item batch");
        for m in moves.iter() {
            ledger::transfer_item(&mut self.items, &m.from, &m.to, &m.good, m.amount)
                .unwrap_or_else(|e| env::panic_str(&e));
        }
        self.log_event("item_transfer", json!({ "moves": moves }));
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

    fn log_event(&self, event: &str, data: near_sdk::serde_json::Value) {
        let payload = json!({
            "standard": EVENT_STANDARD,
            "version": EVENT_VERSION,
            "event": event,
            "data": data,
        });
        env::log_str(&format!("EVENT_JSON:{}", payload));
    }
}
