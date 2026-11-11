# Millbrook — a 5-minute walkthrough for judges

**The pitch in one line:** a tiny 3D town holds a fixed **10,000 coins**, enforced by a
NEAR contract with no admin key — so every coin you earn came from someone else in town,
and you can watch, and verify, exactly where it goes.

This guide takes about five minutes. It runs locally (no hosted URL yet — see the
[README](../README.md#run-it)). The contract is already live on NEAR testnet:
[`millbrook.testnet`](https://testnet.nearblocks.io/address/millbrook.testnet).

```bash
pnpm install
pnpm dev          # web on http://localhost:5173, server on :8080
```

Open **http://localhost:5173** and follow along.

---

## 1 · The 60-second first session (≈1 min)

From the title screen, **Sign in** (any email + a username — the magic link prints to the
server console in dev; you don't need to click it to continue) and **Start a season**.

On the town screen a **guided tour** walks you through the one loop that makes Millbrook
tick. A gold ring follows the live control and the card advances as you act:

1. **Hire a baker** — your bakery needs crew.
2. **Set the bread price** — too high and the town can't afford it; too low and you barely profit.
3. **Press play** — the days start rolling.
4. **Watch your first sale** — gold flows from a customer to your bakery and *Sold today* ticks up.

That's the whole game in miniature: you set a price and a wage, the town decides whether it
can afford to buy and whether it wants to work for you.

> Every number has a reason. Hover a figure, or read the line under each control — the wage
> says how it compares to the town average; the price says whether residents can afford it.

## 2 · The town is alive (≈1 min)

Let it run and look at the diorama behind the HUD:

- A slow **day → night cycle** — a warm dusk, then a lamp-lit night where every window glows,
  then a bright day.
- **Residents walk** between work and home, and **speech bubbles** show their *real* reason
  straight from the rules — "Bought today's bread", "Left the weaver for the smithy: 9 beats 7".
- Shops react to the sim: busy ones smoke, the forge glows, a bankrupt shop boards up.
- **Gold coins arc** from customer to shop on every sale — the one bold element, the money moving.

Click a resident (the "Tap a resident" bubble) to open their card: their trait, employer, wage,
savings, needs, and the exact rule-sentence behind their last choice.

## 3 · The Game Master (≈1 min)

Watch the **Game Master** card (bottom-centre). About once a game-week it reads a real **weather
feed** (Open-Meteo, keyless) plus the town's own metrics and fires one event — a drought, a
heatwave, a festival, a railway price-cap, a tax inspector — always **within hard caps the code
enforces**. Press **"Why did this happen?"** to see the data it read and its reasoning.

The one event that moves coins (the tax inspector) pays into the **Town Co-op**, so the total
never leaves 10,000. Each decision is anchored as a **receipt on NEAR testnet**.

## 4 · Proof — the economy is real (≈1 min)

Open **Proof** (top-right). This is the heart of the submission:

- **10,000 coins, always** — the live split across Residents / Workshops / Co-op / Town Hall
  always sums to exactly 10,000, read from the ledger.
- The contract that enforces it is **live on testnet** — the header and the `millbrook.testnet`
  row link straight to the **explorer**. It has **no admin key, no mint, no burn**; the operator's
  only power is a settlement that re-audits to 10,000 or reverts.
- **Follow a coin** — every move emits a NEP-297 event, so a coin's path (wage → bread → wheat →
  wage) reads off-chain with **no indexer**.
- **Game Master receipt** — the live list of this season's events, each with the source and reasoning.

## 5 · The season and the rest (≈1 min)

- **Fast-forward** a week to fill the charts; **Scoreboard** ranks owners by the goal card and
  shows each one's **reputation** (−100 Ruthless … +100 Fair), which actually feeds back into
  hiring. The **Gazette** writes up the season from the real feed.
- **Rooms** (from the Hub → *Create a room* / *Join with code*): friends join by code, **each
  claims one of the four shops** and runs it, with **chat** and **trade offers** — and the same
  10,000-coin invariant holds across every player's moves.

---

## Verify it yourself (no clicking required)

```bash
pnpm sim --seed 42 --days 28     # a full headless season report (deterministic)
pnpm test                        # unit + integration tests, incl. the 10,000-coin invariant
pnpm contract:test               # the Rust ledger's conservation tests

# The chain, for real (testnet; needs a funded operator in .env for the posting steps)
pnpm --filter @millbrook/game-master gm          # a Game Master decision + receipt (no keys needed)
pnpm tsx scripts/post-receipt.ts                 # anchor a receipt on testnet
pnpm --filter @millbrook/server settle-season -- --days 2   # settle game days on-chain
```

Then open [`millbrook.testnet` on the explorer](https://testnet.nearblocks.io/address/millbrook.testnet)
and check `audit_total` — it is exactly 10,000 after every settlement.

## Honest notes

- The **in-browser season is the deterministic simulation**; the server posts its *net* daily
  transfers to the live contract. The economy rules are shared between the two (`packages/economy`
  and the Rust `millbrook-ledger` mirror each other).
- The Game Master and the Gazette have **fallbacks on by default** (town metrics + a template) and
  **say so** when the weather feed or the AI model isn't available — nothing in the demo breaks
  without keys.
- Rooms are early, and a hosted VPS build is still on the [Roadmap](../README.md#roadmap).

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for how the pieces fit and [`GAME_RULES.md`](GAME_RULES.md)
for the economy in plain language.
