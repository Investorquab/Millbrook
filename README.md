# Millbrook

**A tiny town with a real economy, settled on NEAR.** Thirty residents are both your
workers and your only customers. The town holds a fixed **10,000 coins** — enforced
by a NEAR contract with no admin key and no way to mint — so every coin you earn came
from someone else in town. Run a workshop against AI owners (or, soon, friends in a
room) and try to thrive without wrecking the place.

Built for the **NEAR hackathon — Games With Real Economies**.

- **Contract (live, NEAR testnet):** [`millbrook.testnet`](https://testnet.nearblocks.io/address/millbrook.testnet) — fixed 10,000-coin supply, auditable on-chain.
- **Live demo:** **https://millbrook.185-7-81-139.sslip.io** — the full game: solo play (economy, Game Master, the live on-chain Proof read), passwordless sign-in, and **live multiplayer rooms** (host, share the code, friends join and each run a shop). A solo-only static mirror also runs at https://millbrook-phi.vercel.app.
- **Video:** coming for submission.

---

## What works today

Everything in this list runs in this repo right now and is covered by tests.

### The economy (`packages/economy`)
A pure, deterministic simulation — a seeded RNG, no clocks, no I/O. Thirty residents,
the four Phase-1 workshops (Bakery, Weaver, Smithy, Brewery), a Town Co-op and a Town
Hall. Residents work, get paid, shop, change jobs, strike and migrate; AI owners
(Greedy Gus, Fair Fern, Steady Sam, Risky Rita) each run a readable strategy.

- The **10,000-coin invariant holds after every tick, for 100 random seeds**.
- Same seed → same season (determinism is tested).
- A wage war causes a measurable recession; the Town Hall safety net pulls a crashed
  town back under 20% unemployment within 10 days.
- `pnpm sim --seed 42 --days 28` prints a full season report.

### The game (`apps/web`)
A React + React Three Fiber solo game: a low-poly mill town on a slow day → night
cycle (golden dusk, then a lamp-lit night, then a bright day) whose shops react to
the simulation, walking residents who float speech bubbles with their real reason
(straight from the rules — "Bought today's bread", "Left the weaver for the smithy"),
and a gold coin-flow on sales. Synthesized sound — a coin chime on sales, soft clicks
and a Game Master cue (all made in code, no audio files) — with a mute toggle. Nine screens ported from the approved designs — Title,
Sign-in, Hub, Town (3D HUD), Resident, Proof, Fast-forward, Scoreboard, Gazette. Rule
tooltips explain every number.

- Acceptance test passes: a new player signs in, hires a worker, sets a price and
  sees a sale within 60 seconds.
- A **guided first session** walks a new player through that exact loop — hire → set
  price → play → first sale — with a coach card and a highlight that follows the live
  control, advancing as you act. It shows once and can be skipped.
- A **Foreman** runs standing orders for your shop in plain code each dawn — match
  rival wages (up to a cap) to keep your workers, and hire when bread demand goes
  unmet — and tells you what it did in plain words. (The on-chain Foreman key and
  AI-written wording are roadmap.)
- You **choose your town** on the Hub: the classic four shops, a **full town
  of six** that adds the **Tailor** (buys cloth from the Weaver to make clothes)
  and the **Tavern** (buys bread from the Bakery to make meals) — a real
  inter-workshop supply chain — or a **seven-shop town** that also opens the
  **Apothecary** (buys herbs from the Co-op and sells remedies, with demand
  jumping during an epidemic). The bigger towns' owners are ordered so the
  supplier and specialist shops are well run. Every coin still stays in town, so
  the total holds.
- You **choose your goal** on the Hub before a season — Tycoon (most profit),
  Biggest Employer, Fair Boss (highest wage while profitable), Speedrun (first to
  5,000) or Steadfast (highest standing with the town) — and the season-end
  Scoreboard ranks everyone by it.
- The season-end Scoreboard ranks owners by the goal card and shows each owner's
  **reputation** (−100 Ruthless … +100 Fair), which moves with wages against the
  town average, layoffs and strikes — and feeds back into the game: fair owners
  draw and keep workers, ruthless ones lose them faster (pay is unchanged, so the
  10,000-coin invariant holds). Each owner also earns **trophy badges** for the
  dimension they lead — Top Earner, Biggest Employer, Fairest Boss, Best Payer.
- A **Market** screen shows the whole town at a glance — all four workshops (yours
  and the three AI rivals) with price, wage, crew, stock, sales, profit and standing,
  the public purse, and a town-wide ledger — all live from the same season.
- The town **ages**: residents grow a year older each game week, retire at 65 to
  live on their savings, and the very old pass away peacefully — their savings
  passing to an heir in town minus a 10% estate tax to the Town Hall (all to the
  Town Hall with no heir). Every coin stays in town, so the total never leaves
  10,000; retirements and deaths show up in the feed and the Gazette.
- And the town **grows**: in a thriving, low-unemployment week a comfortable
  resident has a child — a dependent (a mouth to feed, out of the labour force)
  who starts looking for work two game weeks later. Births are conservative and
  capped so a season can't run away, and the parent's small endowment only moves
  coins, so the total stays 10,000.
- **Holidays and festivals**: a weekly market day and a mid-season harvest
  festival lift the town's appetite to spend — more ale, meals and clothes sold.
  Demand only: residents spend coins they already hold, so the total holds.
- Residents **rent** their homes: a small daily rent comes out of their wage to
  the Town Hall (the public landlord). As the town grows past its **houses**, its
  poorest are left without a home and start to drift away — so the Town Hall
  **builds houses** under pressure, paying residents to raise them. Only coins
  between residents and the Town Hall move, so the total holds at 10,000.
- The town also **governs itself**: at each phase boundary the residents hold an
  **election**, each voting by their own welfare — the comfortable for a thrifty
  Mayor (lower taxes), the struggling for a caring one (more benefits and a
  minimum wage). The winner sets the Town Hall's tax and benefit policy for the
  phase. Only rates change, never the 10,000-coin total.
- When a town is left to **struggle** (unemployment runs high), petty **theft**
  bites — a little of each shop's stock goes missing overnight. Goods are lost,
  never coins, so the total stays 10,000; the only real fix is to get the town
  back to work. You can **post a guard** at your shop: on a bad night you pay the
  watch (coins that recirculate) and your stock is spared — the guard-vs-losses
  decision from the design.
- A workshop can catch **fire** and lose its stock. **Insure** your shop (a small
  daily premium into the Town Co-op's pool) and the pool pays a claim when fire
  strikes, or take the risk. Fire destroys goods, never coins; premiums and
  claims only move coins between the shop and the pool, so the total holds at
  10,000. Cautious AI owners insure; the greedy and the risky chance it.
- A workshop that **can't pay wages for three days goes bankrupt** — and its
  premises don't sit empty: they go to **auction**. Around mid-season an AI owner
  also retires and puts their shop up, so you reliably get the chance to **bid**:
  stake coins from your till to take over a second shop and run it, or let an AI
  buyer have it. The former owner's estate is swept to the Town Hall, so the
  town's 10,000 coins stay in town while its trade keeps churning. (A shop you
  run is never auctioned out from under you.)
- **Follow a coin** (on the Proof screen) traces one coin hand to hand through the
  town — a wage becomes bread, bread becomes wheat, wheat becomes a farmer's wage —
  reading real moves from the season's ledger; "trace another coin" picks a new path.
  (On the static demo these are the deterministic sim's moves, which the server nets
  into the day's on-chain settlement; per-transaction explorer links are roadmap.)

### The chain (`contracts/millbrook`) — **live on testnet**
A Rust (near-sdk) economy ledger. A pure `millbrook-ledger` core holds the invariant
logic; a thin `#[near]` shell persists it on-chain.

- Seeded to exactly 10,000 coins; **re-audited on-chain after every settlement**.
- **Settlement is operator-only** and conserves by construction; an overdraw is
  refused.
- **No mint, no burn, no owner/upgrade/migrate/pause** — the operator's only power is
  conservation-preserving settlement.
- Every move emits a NEP-297 `EVENT_JSON` so "Follow a coin" needs no indexer.
- Verified live: seeded + audited at 10,000, and real settlements on the
  [explorer](https://testnet.nearblocks.io/address/millbrook.testnet).

### Settlement (`apps/server`)
The server diffs the ledger each game day and posts the **net** transfers to the
contract, recording each transaction hash. Verified live: two game days settled
on-chain with the audited total holding at exactly 10,000.

### The Game Master (`packages/economy`, `outlayer/game-master`)
An AI that reads town metrics and a real **weather feed** (Open-Meteo, keyless) and
fires one event a game week from a fixed catalog — drought, heatwave, festival,
railway, tax inspector, an epidemic that keeps sick workers off the job, and more —
always within hard caps the code enforces. During an **epidemic** you choose
whether to **pay sick workers in full** (goodwill with the town) or dock them
(coins saved, standing lost). The one
coin-moving event (the tax inspector) pays into the Town Co-op, so coins never leave
the 10,000. Each decision carries a reasoning paragraph and a **receipt anchored on
NEAR** (`record_receipt`). The Town's "Why did this happen?" card shows the data, the
reasoning and the source.

- If the weather feed or the AI model is unavailable, it falls back to town metrics
  and a template, and **says so** — tested at both the simulation and enclave layers.

### Sign-in (`apps/server` magic links)
Passwordless, no wallet: enter an email and a username and the server emails a
one-time link (Resend; without a key it logs the link to its console so the flow
still works). Clicking it mints a session the browser keeps, and that username is
your identity in rooms, chat and on scoreboards. Solo play stays guest-friendly;
hosting or joining a room asks you to sign in first. Tokens are single-use,
expire in 15 minutes, and are stored only as a hash.

### Rooms (`apps/server` + web client)
A Socket.IO server with rooms: create, invite code, lobby, host start, and a live
tick that advances the season. The web client (Host/Join screens) is wired to it:
friends join by code, **each claims one of the four shops and runs it** (the host
runs the bakery), and everyone watches the same shared town. AI owners fill any
shop no one claims. **Room chat** with who's-here and join/claim notices runs over
the same socket (lines trimmed and length-capped). Players also post **trade offers**
— "N of my good for P coins" to the room or a named player — which another player
accepts; coins move buyer→seller and goods seller→buyer (tools lift the buyer's
output), always conserving the town's 10,000 coins. HTTP `/health` and `/rooms`.
The `infra/` stack (Node server + Postgres 16 + Caddy) is ready for a VPS.

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

Copy `.env.example` to `.env` and fill what you need. **Nothing here needs a paid key
to run** — the weather feed is keyless, and the Game Master, login and enclave all have
fallbacks. See [`docs/SETUP.md`](docs/SETUP.md).

---

## What's on-chain, what's off-chain, and why

The simulation runs on the server for speed; **money settles to NEAR once per game
day**. The contract refuses any batch that would change the 10,000 total, so the
economy is provably closed.

- **NPC balances live inside the contract**, under their own ids (`r0`…, `w0`…,
  `coop`, `townhall`), not as separate accounts. Creating 30+ real accounts per room
  is slow and burns testnet tokens; balances inside the contract are still on-chain
  and auditable, and every transfer emits an event with a transaction hash. This is a
  deliberate trade-off, stated plainly.
- **Player accounts are custodial** testnet sub-accounts held by the server, which is
  what lets email-style login work with no wallet. **Testnet only.**

New here? [`docs/DEMO.md`](docs/DEMO.md) is a **5-minute walkthrough for judges**.
See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full picture,
[`docs/GAME_RULES.md`](docs/GAME_RULES.md) for the economy rules, and
[`docs/DEPLOY.md`](docs/DEPLOY.md) to put it on a VPS with a live URL.

---

## Honest notes

- **Testnet only.** No real value moves. Mainnet is used only for a prize-payout
  account, if required by the submission form.
- **Custodial accounts.** The server holds player keys so there's no wallet step.
- **Fallbacks are on by default.** Without a NEAR AI Cloud key or an OutLayer enclave
  account, the Game Master runs on town metrics with template reasoning and an
  unattested (but still hash-verifiable) receipt, and the UI says so.
- **Rooms are early.** Each player claims and runs one of the four shops in a shared
  town, can chat, and can trade goods for coins; rooms live in memory until Postgres
  persistence lands.

---

## Roadmap

- Deeper moderation tools; trade offers as timed decision cards with a default answer
- Postgres persistence so a server restart loses nothing
- The Foreman as an on-chain NEAR account (function-call key) with AI-written notes
- The Gazette written live by NEAR AI; real NEAR AI + OutLayer keys in the enclave
- The Carpenter and finished house parts (housing supply has rent today, no builder yet)
- Deploy to a VPS behind a domain (HTTPS via Caddy) with a demo room to join

---

## Layout

```
apps/web              React + Vite + R3F: the 3D town and the HUD
apps/server           Node 22 + TypeScript: rooms, settlement, (soon) chat and the Game Master
packages/economy      The pure, deterministic simulation — all rules in src/rules.ts
packages/shared       Shared types, the goods/workshop catalog and the event catalog
contracts/millbrook   Rust: the fixed-10,000-coin ledger (ledger core + #[near] shell)
outlayer/game-master  The Game Master enclave job: weather + NEAR AI + receipt
infra/                docker-compose (server, Postgres, Caddy) and the Caddyfile
scripts/              Spikes, deploy + settlement + receipt scripts, check-public
design/               The approved screens, screenshots and original CC0 art
docs/                 SETUP, ARCHITECTURE, GAME_RULES
```

All original art is CC0; every asset and font is listed with its license in
[`LICENSES.md`](LICENSES.md).
