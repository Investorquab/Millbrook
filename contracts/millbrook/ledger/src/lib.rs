//! The pure Millbrook coin-ledger core.
//!
//! Every rule that makes the economy *real* lives here, as plain Rust over a
//! `BTreeMap` with no NEAR host calls, no `env`, and no I/O — exactly like the
//! TypeScript `packages/economy` ledger it mirrors. The `#[near]` shell in the
//! `millbrook-contract` crate is a thin wrapper that reads the caller, persists
//! this state, and turns an `Err` here into a transaction-reverting panic.
//!
//! Keeping the core a dependency-free leaf crate means the invariants below are
//! proven by a fast `cargo test` that links no on-chain machinery.

use std::collections::BTreeMap;

/// The fixed total money supply. A season's seed must sum to exactly this, and
/// no operation here can ever change it.
pub const TOTAL_COINS: u64 = 10_000;

/// account id (or "account|good" for items) -> quantity.
pub type Balances = BTreeMap<String, u64>;

/// Only the operator may settle. Kept here, as a pure string comparison, so the
/// authorization rule is unit-tested without the NEAR VM.
pub fn authorize(caller: &str, operator: &str) -> Result<(), String> {
    if caller == operator {
        Ok(())
    } else {
        Err("Only the game operator can settle".into())
    }
}

/// Build the starting balances from a seed, rejecting anything that would not
/// be a valid fixed-supply ledger: an empty seed, a blank or duplicate id, or a
/// total that is not exactly [`TOTAL_COINS`].
pub fn seed_balances(entries: &[(String, u64)]) -> Result<Balances, String> {
    if entries.is_empty() {
        return Err("Seed must not be empty".into());
    }
    let mut coins = Balances::new();
    let mut total: u64 = 0;
    for (id, amount) in entries {
        if id.is_empty() {
            return Err("Account id must not be empty".into());
        }
        if coins.contains_key(id) {
            return Err(format!("Duplicate account id in seed: {id}"));
        }
        total = total.checked_add(*amount).ok_or("Seed total overflowed")?;
        coins.insert(id.clone(), *amount);
    }
    if total != TOTAL_COINS {
        return Err(format!(
            "Seed must total exactly {TOTAL_COINS} coins, got {total}"
        ));
    }
    Ok(coins)
}

/// Move `amount` coins from `from` to `to`, in place.
///
/// Rejects a non-positive amount, a self-transfer, or — crucially — any debit
/// the source cannot cover. That last check is the only thing standing between
/// a settlement and conjured coins: you can never take out more than is there,
/// so the total is preserved by construction. A credit to an unknown id creates
/// that account (a new arrival in town).
pub fn apply_transfer(
    coins: &mut Balances,
    from: &str,
    to: &str,
    amount: u64,
) -> Result<(), String> {
    if amount == 0 {
        return Err("Transfer amount must be positive".into());
    }
    if from == to {
        return Err("Transfer from and to must differ".into());
    }
    let from_bal = *coins.get(from).unwrap_or(&0);
    if from_bal < amount {
        return Err(format!(
            "Insufficient balance: {from} has {from_bal}, cannot send {amount} (a settlement cannot create coins)"
        ));
    }
    let to_bal = *coins.get(to).unwrap_or(&0);
    coins.insert(from.to_string(), from_bal - amount);
    coins.insert(to.to_string(), to_bal + amount);
    Ok(())
}

/// Independently re-sum every balance. Used after each settlement to prove the
/// total never drifted from the fixed supply.
pub fn total(coins: &Balances) -> u64 {
    coins.values().sum()
}

// ── Goods (a separate ledger — not coins) ────────────────────────────────────

/// The storage key for a quantity of one good held by one account.
pub fn item_key(account: &str, good: &str) -> String {
    format!("{account}|{good}")
}

/// Mint goods into an account (a workshop's daily output). Goods are not coins.
pub fn produce(items: &mut Balances, account: &str, good: &str, amount: u64) -> Result<(), String> {
    if amount == 0 {
        return Err("Produce amount must be positive".into());
    }
    let key = item_key(account, good);
    let bal = *items.get(&key).unwrap_or(&0);
    items.insert(key, bal.checked_add(amount).ok_or("Goods overflow")?);
    Ok(())
}

/// Burn goods from an account (bread eaten, cloth worn).
pub fn consume(items: &mut Balances, account: &str, good: &str, amount: u64) -> Result<(), String> {
    if amount == 0 {
        return Err("Consume amount must be positive".into());
    }
    let key = item_key(account, good);
    let bal = *items.get(&key).unwrap_or(&0);
    if bal < amount {
        return Err(format!("Not enough {good} to consume: {account} has {bal}"));
    }
    items.insert(key, bal - amount);
    Ok(())
}

/// Move goods between accounts (a sale's delivery).
pub fn transfer_item(
    items: &mut Balances,
    from: &str,
    to: &str,
    good: &str,
    amount: u64,
) -> Result<(), String> {
    if amount == 0 {
        return Err("Item amount must be positive".into());
    }
    if from == to {
        return Err("Item from and to must differ".into());
    }
    let from_key = item_key(from, good);
    let from_bal = *items.get(&from_key).unwrap_or(&0);
    if from_bal < amount {
        return Err(format!("Not enough {good} to transfer: {from} has {from_bal}"));
    }
    let to_key = item_key(to, good);
    let to_bal = *items.get(&to_key).unwrap_or(&0);
    items.insert(from_key, from_bal - amount);
    items.insert(to_key, to_bal.checked_add(amount).ok_or("Goods overflow")?);
    Ok(())
}

/// The total quantity of one good held across every account — the NEP-245
/// "supply" of that token id. `None` if the good has never appeared in the
/// ledger (an unknown token), `Some(sum)` otherwise (which may be 0 once every
/// holder has consumed theirs). Pure: a scan of the small item map.
pub fn item_supply_opt(items: &Balances, good: &str) -> Option<u64> {
    let suffix = format!("|{good}");
    let mut found = false;
    let mut sum: u64 = 0;
    for (key, qty) in items.iter() {
        if key.ends_with(&suffix) {
            found = true;
            sum = sum.saturating_add(*qty);
        }
    }
    if found {
        Some(sum)
    } else {
        None
    }
}

/// Every distinct good (NEP-245 token id) that has ever appeared, sorted. Used
/// to enumerate the token types the one contract holds.
pub fn distinct_goods(items: &Balances) -> Vec<String> {
    let mut goods: Vec<String> = items
        .keys()
        .filter_map(|k| k.split_once('|').map(|(_, good)| good.to_string()))
        .collect();
    goods.sort();
    goods.dedup();
    goods
}

/// The goods one account holds, as `(good, quantity)` pairs with a positive
/// balance, sorted by good. Backs NEP-245 `mt_tokens_for_owner`.
pub fn goods_of(items: &Balances, account: &str) -> Vec<(String, u64)> {
    let prefix = format!("{account}|");
    let mut held: Vec<(String, u64)> = items
        .iter()
        .filter(|(k, v)| **v > 0 && k.starts_with(&prefix))
        .map(|(k, v)| (k[prefix.len()..].to_string(), *v))
        .collect();
    held.sort();
    held
}

// ════════════════════════════════════════════════════════════════════════════
// Unit tests — pure, no NEAR VM, no C/NASM toolchain
// ════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    /// A valid 10,000-coin seed: three residents, one workshop, co-op, town hall.
    fn seed() -> Vec<(String, u64)> {
        vec![
            ("r0".into(), 100),
            ("r1".into(), 100),
            ("r2".into(), 100),
            ("w0".into(), 4000),
            ("coop".into(), 3200),
            ("townhall".into(), 2500),
        ]
    }

    #[test]
    fn operator_is_authorized_and_a_stranger_is_rejected() {
        assert!(authorize("millbrook.testnet", "millbrook.testnet").is_ok());
        let err = authorize("intruder.testnet", "millbrook.testnet").unwrap_err();
        assert!(err.contains("Only the game operator"), "got: {err}");
    }

    #[test]
    fn seeds_to_exactly_ten_thousand() {
        let coins = seed_balances(&seed()).unwrap();
        assert_eq!(total(&coins), TOTAL_COINS);
        assert_eq!(coins["w0"], 4000);
        assert_eq!(coins["r0"], 100);
    }

    #[test]
    fn rejects_a_seed_that_is_not_ten_thousand() {
        let err = seed_balances(&[("r0".into(), 9999)]).unwrap_err();
        assert!(err.contains("must total exactly"), "got: {err}");
    }

    #[test]
    fn rejects_duplicate_seed_ids() {
        let err = seed_balances(&[("r0".into(), 5000), ("r0".into(), 5000)]).unwrap_err();
        assert!(err.contains("Duplicate"), "got: {err}");
    }

    #[test]
    fn rejects_an_empty_seed() {
        assert!(seed_balances(&[]).is_err());
    }

    #[test]
    fn a_transfer_moves_coins_and_conserves() {
        let mut coins = seed_balances(&seed()).unwrap();
        apply_transfer(&mut coins, "w0", "r0", 8).unwrap();
        apply_transfer(&mut coins, "w0", "r1", 8).unwrap();
        assert_eq!(coins["w0"], 4000 - 16);
        assert_eq!(coins["r0"], 108);
        assert_eq!(coins["r1"], 108);
        assert_eq!(total(&coins), TOTAL_COINS);
    }

    #[test]
    fn a_transfer_can_create_a_new_arrival() {
        let mut coins = seed_balances(&seed()).unwrap();
        apply_transfer(&mut coins, "townhall", "r9", 10).unwrap();
        assert_eq!(coins["r9"], 10);
        assert_eq!(total(&coins), TOTAL_COINS);
    }

    #[test]
    fn an_overdraw_is_refused_and_nothing_moves() {
        let mut coins = seed_balances(&seed()).unwrap();
        // r0 holds 100; moving 101 would mint a coin.
        let err = apply_transfer(&mut coins, "r0", "w0", 101).unwrap_err();
        assert!(err.contains("Insufficient balance"), "got: {err}");
        assert_eq!(coins["r0"], 100, "the failed transfer must not have mutated r0");
        assert_eq!(total(&coins), TOTAL_COINS);
    }

    #[test]
    fn rejects_zero_and_self_transfers() {
        let mut coins = seed_balances(&seed()).unwrap();
        assert!(apply_transfer(&mut coins, "w0", "r0", 0).is_err());
        assert!(apply_transfer(&mut coins, "w0", "w0", 5).is_err());
        assert_eq!(total(&coins), TOTAL_COINS);
    }

    #[test]
    fn no_sequence_of_transfers_can_change_the_total() {
        let mut coins = seed_balances(&seed()).unwrap();
        let moves = [
            ("w0", "r0", 50),
            ("r0", "coop", 30),
            ("coop", "townhall", 1000),
            ("townhall", "r2", 99),
            ("w0", "r1", 100),
        ];
        for (f, t, a) in moves {
            apply_transfer(&mut coins, f, t, a).unwrap();
            // The invariant holds after *every* single move, not just at the end.
            assert_eq!(total(&coins), TOTAL_COINS);
        }
    }

    #[test]
    fn goods_mint_burn_and_move_without_touching_coins() {
        let coins = seed_balances(&seed()).unwrap();
        let mut items = Balances::new();
        produce(&mut items, "w0", "bread", 10).unwrap();
        assert_eq!(items[&item_key("w0", "bread")], 10);
        transfer_item(&mut items, "w0", "r0", "bread", 3).unwrap();
        assert_eq!(items[&item_key("w0", "bread")], 7);
        assert_eq!(items[&item_key("r0", "bread")], 3);
        consume(&mut items, "r0", "bread", 1).unwrap();
        assert_eq!(items[&item_key("r0", "bread")], 2);
        // Coins untouched throughout.
        assert_eq!(total(&coins), TOTAL_COINS);
    }

    #[test]
    fn cannot_consume_or_transfer_goods_you_lack() {
        let mut items = Balances::new();
        produce(&mut items, "w0", "bread", 2).unwrap();
        assert!(consume(&mut items, "w0", "bread", 3).is_err());
        assert!(transfer_item(&mut items, "w0", "r0", "bread", 5).is_err());
    }

    // ── NEP-245 helpers (supply, enumeration) ─────────────────────────────────

    #[test]
    fn item_supply_sums_across_holders_and_is_none_for_unknown() {
        let mut items = Balances::new();
        produce(&mut items, "w0", "bread", 10).unwrap();
        produce(&mut items, "w1", "bread", 5).unwrap();
        transfer_item(&mut items, "w0", "r0", "bread", 3).unwrap();
        // Supply is conserved by a transfer: 10 + 5 = 15 across w0(7), w1(5), r0(3).
        assert_eq!(item_supply_opt(&items, "bread"), Some(15));
        // A good the ledger has never seen has no supply (null), not 0.
        assert_eq!(item_supply_opt(&items, "cloth"), None);
        // A consume lowers supply.
        consume(&mut items, "r0", "bread", 3).unwrap();
        assert_eq!(item_supply_opt(&items, "bread"), Some(12));
    }

    #[test]
    fn supply_suffix_does_not_confuse_similar_good_names() {
        let mut items = Balances::new();
        produce(&mut items, "w0", "bread", 4).unwrap();
        produce(&mut items, "w0", "gingerbread", 9).unwrap();
        // "gingerbread" must not count toward "bread".
        assert_eq!(item_supply_opt(&items, "bread"), Some(4));
        assert_eq!(item_supply_opt(&items, "gingerbread"), Some(9));
    }

    #[test]
    fn enumerates_distinct_goods_and_an_owner_holdings() {
        let mut items = Balances::new();
        produce(&mut items, "w0", "bread", 10).unwrap();
        produce(&mut items, "w1", "cloth", 6).unwrap();
        transfer_item(&mut items, "w0", "r0", "bread", 2).unwrap();
        assert_eq!(distinct_goods(&items), vec!["bread".to_string(), "cloth".to_string()]);
        assert_eq!(goods_of(&items, "r0"), vec![("bread".to_string(), 2)]);
        // A consumed-to-zero holding drops out of an owner's list.
        consume(&mut items, "r0", "bread", 2).unwrap();
        assert!(goods_of(&items, "r0").is_empty());
    }
}
