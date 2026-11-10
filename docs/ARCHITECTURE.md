# Architecture

How the pieces fit, and where the line between off-chain speed and on-chain truth sits.

```
  Browser (apps/web)
    React + React Three Fiber — the 3D town, the HUD, the Proof panel
        │  Socket.IO (rooms, live view, actions)
        ▼
  Game server (apps/server)  ── Node 22 + TypeScript, one process
    • rooms + the live season (the same packages/economy engine)
    • settlement: diff the ledger each game day → net transfers
    • (soon) chat, Foreman agents, player sub-accounts
        │  functionCall "settle" / "record_receipt" (operator key)
        ▼
  NEAR contract (contracts/millbrook) ── testnet, millbrook.testnet
    • fixed 10,000-coin ledger, re-audited after every settlement
    • no mint, no admin key, operator-only settlement
    • NEP-297 events for every move (Follow a coin)
        ▲
        │  event + receipt hash
  OutLayer enclave (outlayer/game-master)
    • reads town metrics + a real weather feed (Open-Meteo)
    • asks NEAR AI Cloud to pick & explain an event (fallback: metrics + template)
    • returns the event within hard caps, plus an attested receipt
```

## The one rule everything serves

**Total coins = 10,000, always.** The simulation moves coins internally all day
(wages, sales, raw materials). The contract is the source of truth for the supply: it
refuses any settlement that would change the total, and there is no method to mint,
burn, or otherwise change a balance outside a conservation-preserving `settle`.

Two layers enforce it, independently:

1. **`packages/economy`** — a pure `Ledger` that only ever *transfers* coins and
   asserts the total after every day. Tested across 100 random seeds.
2. **`contracts/millbrook`** — the on-chain ledger. The pure `millbrook-ledger` crate
   rejects a non-conserving seed or an overdraw; the `#[near]` shell re-sums every
   balance after each batch and panics (reverting the call) if the total ever drifts.

## Settlement

The server runs the season for responsiveness. At each game-day dusk it takes a
snapshot of the ledger, diffs it against the last settled snapshot, and turns the net
change into a minimal set of `(from, to, amount)` transfers (`apps/server/settlement.ts`).
Because both snapshots hold the same total, the batch conserves by construction — the
contract would reject it otherwise. The server records each transaction hash.

## Why NPC balances live inside the contract

Residents, AI owners, the Co-op and the Town Hall hold their coins **inside** the
contract under their own ids, not as separate NEAR accounts. Creating 30+ real
accounts per room is slow and burns testnet tokens. Balances inside the contract are
still on-chain and auditable, and every transfer emits an event with a transaction
hash — so "Follow a coin" needs no separate indexer. This is a deliberate trade-off.

Player accounts are real custodial testnet sub-accounts of the operator, held by the
server, which is what lets login work with no wallet. **Testnet only.**

## The Game Master, and why the AI can't cheat

The event **choice is constrained before any model runs.** The eligible events and
their capped parameters (a price at most 3×, at most 5 days, one event a game week,
one Phase-3 shock) are computed in pure code from the shared catalog. NEAR AI only
*picks among* and *explains* those already-capped candidates — it can't invent an
event or widen an effect. A unit test feeds a hostile model a `durationDays: 9999` and
the job ignores it. If the weather feed or the model is down, it falls back to town
metrics and a template and says so. The decision's receipt (a hash over its inputs and
choice; a hardware quote in a real OutLayer enclave) is anchored on NEAR.

## Determinism

`packages/economy` is pure: a seeded RNG, no `Date.now()`, no `Math.random()`, no I/O.
The same seed produces the same season everywhere — the web game, the server, the
tests and the on-chain seed all agree. The Game Master is opt-in and, when on, still
deterministic per seed.

## Stack

React + Vite + React Three Fiber (web) · Node 22 + TypeScript + Socket.IO (server) ·
Rust + near-sdk (contract) · Postgres 16 + Caddy (infra) · pnpm workspaces · Vitest +
Playwright.
