# Millbrook

**A tiny town with a real economy, settled on NEAR.** Thirty residents are both your
workers and your only customers. The town holds a fixed **10,000 coins** — enforced
by a NEAR contract with no admin key and no way to mint — so every coin you earn came
from someone else in town. Run a workshop against AI owners (or, soon, friends in a
room) and try to thrive without wrecking the place.

Built for the **NEAR hackathon — Games With Real Economies**.

- **Contract (live, NEAR testnet):** [`millbrook.testnet`](https://testnet.nearblocks.io/address/millbrook.testnet) — fixed 10,000-coin supply, auditable on-chain.
- **Live demo URL:** not yet deployed (runs locally — see [Run it](#run-it)). A hosted build on a VPS is in [Roadmap](#roadmap).
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
A React + React Three Fiber solo game: a low-poly mill town at dusk whose shops react
to the simulation, walking residents, and a gold coin-flow on sales. Nine screens
ported from the approved designs — Title, Sign-in, Hub, Town (3D HUD), Resident, Proof,
Fast-forward, Scoreboard, Gazette. Rule tooltips explain every number.

- Acceptance test passes: a new player signs in, hires a worker, sets a price and
  sees a sale within 60 seconds.

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
railway, tax inspector and more — always within hard caps the code enforces. The one
coin-moving event (the tax inspector) pays into the Town Co-op, so coins never leave
the 10,000. Each decision carries a reasoning paragraph and a **receipt anchored on
NEAR** (`record_receipt`). The Town's "Why did this happen?" card shows the data, the
reasoning and the source.

- If the weather feed or the AI model is unavailable, it falls back to town metrics
  and a template, and **says so** — tested at both the simulation and enclave layers.

### Rooms (`apps/server` + web client)
A Socket.IO server with rooms: create, invite code, lobby, host start, and a live
tick that advances the season. The web client (Host/Join screens) is wired to it:
friends join by code, **each claims one of the four shops and runs it** (the host
runs the bakery), and everyone watches the same shared town. AI owners fill any
shop no one claims. HTTP `/health` and `/rooms`. The `infra/` stack (Node server +
Postgres 16 + Caddy) is ready for a VPS.

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

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full picture and
[`docs/GAME_RULES.md`](docs/GAME_RULES.md) for the economy rules.

---

## Honest notes

- **Testnet only.** No real value moves. Mainnet is used only for a prize-payout
  account, if required by the submission form.
- **Custodial accounts.** The server holds player keys so there's no wallet step.
- **Fallbacks are on by default.** Without a NEAR AI Cloud key or an OutLayer enclave
  account, the Game Master runs on town metrics with template reasoning and an
  unattested (but still hash-verifiable) receipt, and the UI says so.
- **Rooms are early.** Each player claims and runs one of the four shops in a shared
  town; chat and trades are still in Roadmap, and rooms live in memory until Postgres
  persistence lands.

---

## Roadmap

- Room chat, trade offers, who's-online and moderation
- Postgres persistence so a server restart loses nothing
- Foreman standing orders and decision cards; reputation
- The Gazette written live by NEAR AI; real NEAR AI + OutLayer keys in the enclave
- Ageing, death and inheritance; Tailor and Tavern; bankruptcy and auctions
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
