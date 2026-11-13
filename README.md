<div align="center">

# Millbrook

### A tiny town with a real economy, settled on NEAR.

**Thirty residents are both your workers and your only customers.**
The town holds a fixed **10,000 coins** — enforced by a NEAR contract with no admin
key and no way to mint — so every coin you earn came from someone else in town.
Cut wages and your own market shrinks. When every owner does it, a recession emerges
that nobody scripted.

Built for the **NEAR Hackathon — Games With Real Economies** · *the economy is the gameplay.*

**[▶ Play the live game](https://millbrook.185-7-81-139.sslip.io)** · **[🎬 Watch the demo](docs/Millbrook_NEAR_GamesWithRealEconomies.mp4)** · **[🔗 Contract on NEAR testnet](https://testnet.nearblocks.io/address/game.millbrook.testnet)** · **[💻 Source](https://github.com/Investorquab/Millbrook)**

</div>

---

## Why we built Millbrook

Most "crypto games" bolt a token onto a game. We wanted the opposite: a game where the
**economy is the whole point**, and the chain is simply what makes the economy
impossible to fake.

The oldest idea in economics is the **circular flow** — your wages are someone else's
spending, and their spending is your income. Millbrook makes that literal and small
enough to *feel*. The same thirty people are the labour and the demand. Underpay them
and they can't buy your bread. There is no faucet and no sink: a NEAR contract holds
exactly 10,000 coins and **rejects any settlement that doesn't still sum to 10,000**.
That one rule turns a town-builder into a genuinely closed economy you can audit on a
public explorer — and a game where the interesting failures (recessions, wage wars,
bankruptcies) are emergent, not scripted.

And the player should never have to think about any of that. No wallet, no seed phrase,
no gas, no popups — just an email, a shop, and a town that reacts.

---

## The game loop (designed on paper first)

| Cadence | What you do |
| --- | --- |
| **Every ~30 seconds** | Set a price, hire or fire a resident, read *why* someone just quit or bought (a plain-words tooltip from the rules), and watch a sale send a gold coin arcing from customer to shop. |
| **Every ~5 minutes** (a season, live or fast-forwarded) | Respond to **Game Master** events (a drought, a festival, an epidemic), answer **decision cards** (a raise demand, a Town Hall loan), survive a rival's wage war, vote in an **election**, weather a fire or a strike — and watch town-wide unemployment and sales move in response. |
| **Every session** | Pick your **town** (4–8 shops) and your **goal card** (20 of them), play a 28-day season against AI owners, or **host a room** and run shops with friends. Climb the **Scoreboard**, then open the **Proof** screen and follow a single coin through the whole town. |

A **Fast-forward** screen simulates a week of trading in seconds so a judge can watch the
economy move without waiting.

---

## How it meets the track

> **Games With Real Economies** — *Build NPCs with wallets, player-owned markets and economies that evolve without a dev patch. Judged on the game loop, not the token — bonus if players never notice the chain. Lean on: Agent NPCs, social login, NEAR Intents, NEP-245.*

| Track ask | In Millbrook | Status |
| --- | --- | --- |
| **NPCs with wallets** | Every resident, owner, the Co-op and the Town Hall holds an on-chain balance inside the contract (ids `r0…`, `w0…`, `coop`, `townhall`). AI owners (Greedy Gus, Fair Fern, Steady Sam, Risky Rita) each run a shop, set prices from their stock and the town's demand, and can go bankrupt. | ✅ Live |
| **Agent NPCs** | The **Game Master** is an AI agent (NEAR AI Cloud) that reads real weather + town metrics and changes the world within hard caps the contract enforces — then anchors a signed receipt on NEAR. Merchant owners are rule-based agents whose reasoning shows in a tooltip. | ✅ Live |
| **Social / email login** | Passwordless email magic-link sign-in. No seed phrase, no wallet popup, **no gas in the normal loop** — accounts are custodial testnet sub-accounts. | ✅ Live |
| **NEP-245 multi tokens** | One contract holds **every item type** (`bread`, `cloth`, `tool`, …) as NEP-245 multi tokens, with the full standard surface and `mt_mint`/`mt_burn`/`mt_transfer` events. Exercised on-chain. | ✅ Live |
| **Economy evolves without a dev patch** | Recessions, wage wars, unionisation, elections, ageing, births, bankruptcies and auctions are all **emergent** from `rules.ts` + the Game Master — no content scripting. | ✅ Live |
| **Players never notice the chain** | No wallet, no gas, no signing in the game loop. The chain surfaces only on the optional **Proof** screen. | ✅ Live |
| **NEAR Intents** | Not used — see [Honest notes](#honest-notes). The custodial, server-settled design means players never sign a transaction, so there's no in-loop intent to route. A candidate for a future wallet-optional mode. | ◻️ Roadmap |

**Pricing rules live in one readable file:** [`packages/economy/src/rules.ts`](packages/economy/src/rules.ts). Every rule returns its reason as a short sentence for the tooltip.

---

## For judges — start here

1. **Open [the live game](https://millbrook.185-7-81-139.sslip.io)** → *Play solo* → hire a worker, set a price, press play. You'll see a sale (and hear a coin) within a minute; a guided tour walks the loop.
2. **Cause a recession:** slash your wage and **Fast-forward** a week — watch town unemployment rise and everyone's sales fall. Nobody scripted it.
3. **Audit the money:** open **Proof**. It reads the **live** on-chain total from `game.millbrook.testnet` (10,000) and lets you **Follow a coin** hand-to-hand across the town.
4. **See the AI act inside the rules:** play until a **Game Master** event fires, then click *"Why did this happen?"* for the data it read, its reasoning, and the on-chain receipt.
5. **Play together:** on the Hub pick a 6-shop town + a goal card and **host a room**; share the code; a second browser joins and claims a shop; chat and send a trade offer.
6. **Verify the contract** on the [explorer](https://testnet.nearblocks.io/address/game.millbrook.testnet): `audit_total` = 10,000, the NEP-245 views, and the NEP-297 settlement/receipt events. No `mint`, `burn`, `owner`, `upgrade` or `pause` method exists.

**Short on time? [🎬 Watch the demo video](docs/Millbrook_NEAR_GamesWithRealEconomies.mp4)** (click to play on GitHub). A full written **[5-minute walkthrough is in `docs/DEMO.md`](docs/DEMO.md)**.

---

## What works today

Everything below runs in this repo right now and is covered by tests (**157 economy + 64 server tests**, the 10,000-coin invariant checked across 100 seeds).

### The economy — `packages/economy`
A pure, deterministic simulation (seeded RNG, no clocks, no I/O). Thirty residents work,
earn wages, shop, change jobs, strike and migrate; AI owners each run a readable
strategy. **The 10,000-coin invariant holds after every tick, for 100 random seeds**;
same seed → same season. A wage war causes a measurable recession, and the Town Hall
safety net pulls a crashed town back under 20% unemployment within ~10 days.

### The game — `apps/web` (React + React Three Fiber)
A low-poly **mill town at dusk** on a slow day→night cycle whose shops react to the
simulation, with residents who walk to work and float speech bubbles of their *real*
reason, a **gold coin-flow** on every sale, and sound synthesized in code (no audio
files). Highlights:

- **Choose your town:** 4 classic shops, **6** (adds Tailor + Tavern — a real cloth→clothes and bread→meals supply chain), **7** (Apothecary; remedy demand spikes in an epidemic) or **8** (Carpenter builds houses).
- **Choose your goal:** 20 cards — competitive (Tycoon, Biggest Employer, Monopoly, Underdog, Great Depression, Last Will, …) and co-op (Town Hero, Boomtown, Public Works, Housing Crisis, Epidemic). Several change the opening; every setup still totals exactly 10,000.
- **A living town:** residents **age**, **retire**, pass away with an **inheritance** (10% estate tax to the Town Hall), and have **children** in good times; the town holds **elections** that set tax and minimum-wage policy; shops **unionise** and **strike** when underpaid, can catch **fire** (and carry **insurance**), suffer **theft** when unemployment runs high (post a **guard**), and go **bankrupt** → **auction**, where you can bid for a second shop. *Every one of these only moves coins within town, so the total never leaves 10,000.*
- **A Foreman** runs plain-code standing orders for your shop each dawn and reports what it did. **Decision cards** put raises and Town Hall **bank loans** to you with a default answer. A **Market** screen shows the whole town at a glance; a **Scoreboard** ranks owners by the goal card with **reputation** and **trophy badges**; the **Gazette** writes up the week.
- **Follow a coin** (on **Proof**) traces one coin's actual path across the ledger — wage → bread → wheat → farm wage.

### Multiplayer rooms — `apps/server` + web client
A Socket.IO server: create a room, share an invite code, friends join and **each claims
and runs a shop** in the same shared 3D town. The host now also picks the **goal card
and town size**, so a room is as deep as a solo game. Live **chat** and **trade offers**
(goods for coins, always conserving the 10,000) run over the same socket. A room can be
**Live** (plays out in minutes) or a scheduled **League** season with a morning report,
*Ready-to-skip*, season rollover and **event-sourced persistence** (survives a restart
with `DATABASE_URL`).

### Passwordless sign-in — `apps/server`
Enter an email + username; the server sends a one-time magic link (or surfaces it
on-screen in demo mode). Tokens are single-use, 15-minute, stored only as a hash. Solo
play is guest-friendly; hosting or joining a room asks you to sign in first.

---

## On-chain: the NEAR stack

### The contract — `contracts/millbrook` (Rust / near-sdk), **live at [`game.millbrook.testnet`](https://testnet.nearblocks.io/address/game.millbrook.testnet)** (operated by `millbrook.testnet`)
A **two-crate** design: a pure `millbrook-ledger` core holds the invariant logic (unit-tested without a VM), and a thin `#[near]` shell persists it on-chain.

- **Fixed supply.** Seeded to exactly **10,000 coins** and **re-audited on-chain after every settlement** — a batch that doesn't sum to 10,000 is reverted.
- **No privileged power.** **No mint, no burn, no owner, no upgrade, no migrate, no pause.** The operator's *only* ability is conservation-preserving settlement; an overdraw is refused.
- **Goods are [NEP-245](https://nomicon.io/Standards/Tokens/MultiToken/Core) multi tokens.** One contract holds every item type; each good is a `token_id` with per-account balances. Full standard surface — `mt_transfer`/`mt_batch_transfer`, `mt_balance_of`/`mt_batch_balance_of`, `mt_supply`, `mt_token(s)`, `mt_tokens_for_owner`, `mt_metadata` — emitting `mt_mint`/`mt_burn`/`mt_transfer` events. Goods never touch the coin total.
- **Auditable moves.** Every coin move emits a **[NEP-297](https://nomicon.io/Standards/EventsFormat)** `EVENT_JSON`, so *Follow a coin* needs no indexer; Game Master decisions anchor a `gm_receipt` the same way.
- **Verified live (click to check):** seeded + audited at **10,000**, a NEP-245 [`mt_transfer`](https://testnet.nearblocks.io/txns/AknkLqD1Tu26tXisZuoMkPVEcujveem1HuocrvEah4jh) (mint → standard views → a 1-yocto transfer), and a Game Master [`gm_receipt`](https://testnet.nearblocks.io/txns/83D4zUaYecfY5t7YBz1AitqYmyCbNwSrbce3QDjRhoJb) anchored on NEAR. `settle-season` posts real daily `settle` events to it, each re-auditing to exactly 10,000.

### NEAR tools & standards we used
- **NEAR testnet** — the ledger contract `game.millbrook.testnet`, operated by `millbrook.testnet`, deployed and settled against live chain state.
- **near-sdk (Rust)** — the contract, pinned and built to `wasm32-unknown-unknown`.
- **NEP-245** (multi-token goods) and **NEP-297** (event format for settlements, mints and receipts).
- **NEAR AI Cloud** — the Game Master's reasoning model (OpenAI-compatible), with a deterministic template fallback when no key is set.
- **FastNEAR RPC** + **nearblocks** explorer — the browser's live `audit_total` read and the public audit trail.
- **Open-Meteo** (keyless) — the real weather feed the Game Master reads.
- **OutLayer** — an enclave job (`outlayer/game-master`) that runs the Game Master and produces a hash receipt (full TEE attestation is roadmap).

### What's on-chain, what's off-chain, and why
The simulation runs for speed (in the browser for solo, on the server for rooms), and
**money settles to the contract as net daily transfers** that must still total 10,000.
NPC balances live *inside* the contract under their own ids rather than as 30+ separate
accounts — a deliberate trade-off (still on-chain and auditable, far cheaper on testnet),
stated plainly. Player accounts are **custodial** testnet sub-accounts, which is what
lets email login work with no wallet. **Testnet only** — no real value moves.

> **On live settlement:** solo play is the deterministic sim in your browser, and the
> Proof screen reads the live on-chain total. The ledger contract is seeded clean to a
> season's genesis, so `pnpm --filter @millbrook/server settle-season` posts each game
> day's net, conserving diff to it and the audited total holds at exactly 10,000 (a diff
> that didn't conserve would be rejected as coin-creating — that guard is the whole
> point). **Automatic settlement of an arbitrary live *room*** needs the contract seeded
> to match that room's opening distribution, so it's **opt-in and off by default** on the
> public demo; wiring a fresh, per-room-seeded contract for continuous room settlement is
> on the roadmap.

---

## Run it

```bash
pnpm install
pnpm dev                         # web + server locally (web on :5173)
pnpm test                        # all unit + integration tests
pnpm sim --seed 42 --days 28     # headless season report
pnpm e2e                         # Playwright, incl. the 60-second first session

# Contract (Rust; needs a stable Rust toolchain + wasm32 target)
pnpm contract:build
pnpm contract:test
pnpm contract:deploy:testnet     # testnet only; needs a funded operator in .env

# See the Game Master and settlement reach the chain
pnpm --filter @millbrook/game-master gm            # a decision + receipt (no keys needed)
pnpm tsx scripts/post-receipt.ts                   # anchor a receipt on testnet
pnpm --filter @millbrook/server settle-season -- --days 2   # settle game days on-chain

# Whole stack in Docker (build the web first)
pnpm --filter @millbrook/web build
docker compose -f infra/docker-compose.yml up -d
```

Copy `.env.example` to `.env` and fill what you need. **Nothing here needs a paid key to
run** — the weather feed is keyless and the Game Master, login and enclave all have
fallbacks. See [`docs/SETUP.md`](docs/SETUP.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),
[`docs/GAME_RULES.md`](docs/GAME_RULES.md) and [`docs/DEPLOY.md`](docs/DEPLOY.md).

---

## Honest notes

- **Testnet only.** No real value moves; mainnet is used only for a prize-payout account if the form requires one.
- **Custodial accounts.** The server holds player keys so there's no wallet step — the right trade-off for "players never notice the chain," not for self-custody.
- **Fallbacks are on by default.** Without a NEAR AI key or an OutLayer enclave account, the Game Master runs on town metrics with template reasoning and a hash-verifiable (but un-attested) receipt, and the UI says so.
- **On-chain room settlement is opt-in** and off on the public demo (see above).
- **No NEAR Intents (yet).** The in-loop experience is deliberately signature-free, so there's no intent to route today; it's a natural fit for a future wallet-optional / cross-chain deposit mode.

---

## The future of Millbrook

Millbrook is a sandbox for *real* economic systems, and there's a lot of road ahead:

- **Players never notice the chain, but can opt in.** A wallet-optional mode where a player can self-custody, deposit via **NEAR Intents**, and carry their coins and reputation between towns.
- **The Foreman as a true agent.** Give each shop's Foreman its own on-chain NEAR account (a function-call key) so it can act autonomously within limits — an **Agent Economy** where the NPCs trade, borrow and hire on-chain.
- **Many towns, one world.** Multiple contracts (one 10,000-coin town each) connected by trade routes, so goods and migrants flow between economies — and a league table across towns.
- **Deeper Game Master.** A full TEE-attested enclave decision per dusk, with the hardware quote on-chain, and richer world events the model composes from the catalog.
- **Live multiplayer by default.** Postgres-backed persistent League seasons running continuously, with per-transaction explorer links and an in-app audit feed.
- **Moderation, cosmetics and a real player economy** on top of the goods ledger (shop skins, town banners) — all as NEP-245 items, all inside the fixed supply.

---

## Layout

```
apps/web              React + Vite + R3F: the 3D town and the HUD
apps/server           Node 22 + TypeScript: rooms, chat, trades, settlement, the Game Master hook
packages/economy      The pure, deterministic simulation — all rules in src/rules.ts
packages/shared       Shared types, the goods/workshop catalog and the event catalog
contracts/millbrook   Rust: the fixed-10,000-coin ledger (ledger core + #[near] shell, NEP-245 goods)
outlayer/game-master  The Game Master enclave job: weather + NEAR AI + receipt
infra/                docker-compose (server, Postgres, Caddy) and the Caddyfile
scripts/              Spikes, deploy + settlement + receipt scripts, check-public
design/               The approved screens, screenshots and original CC0 art
docs/                 SETUP, ARCHITECTURE, GAME_RULES, DEMO, DEPLOY
```

All original art is CC0; every asset and font is listed with its license in [`LICENSES.md`](LICENSES.md).

<div align="center">

**Millbrook** — a town with a real economy. Built on NEAR.

</div>
