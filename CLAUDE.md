# CLAUDE.md: instructions for coding agents working on Millbrook

Millbrook is a browser game for the NEAR HACKATHON (track: Games With Real Economies). A small 3D town of 30 residents who are both your workers and your only customers. The town holds a fixed 10,000 coins, enforced by a NEAR contract with no admin key. Players run workshops against AI owners (solo) or friends (rooms).

## Read these first, in order

1. `private/BUILD_PLAN.md`: milestones, tasks, acceptance checks and cut lines. Work from this.
2. `private/GAME_DESIGN.md`: the rules, numbers and art direction. This is the source of truth; if the code and this file disagree, ask the human.
3. `design/README.md`: the approved screens, art, design tokens and component list. **Port these screens; don't redesign them and don't regenerate the art.** Look at `design/screenshots/` before building any screen.

If the `private/` folder is missing, stop and ask the human to clone the private repo into `./private` (see `private/README.md` in that repo).

## Skills and tools: set these up before writing code

| What | How | Why |
| --- | --- | --- |
| `premium-game-ui` skill | Already in this repo at `.claude/skills/premium-game-ui/SKILL.md`; Claude Code loads project skills automatically. Check that it's listed | Rules for the 3D scene, characters, HUD, motion and the screenshot review |
| `frontend-design` plugin (Anthropic) | In Claude Code, run `/plugin`, add the marketplace `anthropics/claude-plugins-official` if it isn't there, then install `frontend-design`. If the exact names differ, search the plugin list for "frontend-design" | Typography, color and copy rules |
| NEAR agent skills | `npx skills add near/agent-skills --skill near-intents` and `npx skills add near/agent-skills --skill near-ai-cloud`; add `near-dapp` too if it's listed in that repo | Correct NEAR Intents, NEAR AI Cloud and dApp usage |
| Playwright | `pnpm add -D @playwright/test` then `npx playwright install chromium` | End-to-end tests and the screenshot review |

Load `premium-game-ui` and `frontend-design` before any visual work. If a skill won't install, tell the human instead of carrying on without it; the fallback is the "Art direction and UI" section of `private/GAME_DESIGN.md` plus `design/README.md`.

## Deadline

Development ends **14 Nov 2026, 23:59 UTC**. This repository must be public, with a working build, before then. Plan every day so that `main` runs end to end that night.

## Always ask the human first

Never do these on your own, even if a task seems to require it:

- `git push`, force-push, rewriting history, or changing a repository's visibility
- Posting anywhere (X, Discord, Telegram)
- Signing mainnet transactions, spending tokens, or deploying to mainnet
- Submitting the hackathon form
- Deleting data or databases, or rotating keys

Local commits, testnet deploys and running tests are fine without asking.

## Secrets

- Never write a secret into code, docs, commits, logs, test fixtures or chat. Never ask the human to paste a key into the chat; ask them to put it in `.env` on the machine that needs it.
- `.env` is ignored by git. Keep `.env.example` current: every variable, an empty value, and a one-line comment.
- If a secret is ever committed, stop and tell the human. The key must be rotated; deleting the commit is not enough.

## What is public and what is private

Rule of thumb: if it helps a judge **run, understand or verify** the game, it is public. Strategy, competitor and judge notes, video scripts, post drafts, form answers and server details are private. Secrets go in neither.

| Path | Where | Why |
| --- | --- | --- |
| `apps/`, `packages/`, `contracts/`, `outlayer/`, `infra/`, `scripts/`, tests | Public repo | The judges read and run the code |
| `README.md` | Public repo | The judges' entry point: what it is, live link, video link, how to run, what works, roadmap |
| `docs/DEMO.md` | Public repo | A 5-minute walkthrough for judges |
| `docs/ARCHITECTURE.md`, `docs/GAME_RULES.md` | Public repo | How the economy and the chain fit; helps the AI judges check the README against the code |
| `LICENSES.md` | Public repo | Every asset pack, its URL and its license (CC0 only) |
| `design/` | Public repo | Approved screens, screenshots and original art; shows judges how the game was designed |
| `.claude/skills/` | Public repo | Project skills the coding agent uses |
| `.env.example` | Public repo | Shows which keys are needed, with empty values |
| `CLAUDE.md` | Public repo | These instructions; no strategy in here |
| `private/BUILD_PLAN.md`, `private/GAME_DESIGN.md` | Private repo | Contains the judge audit, competitor notes and scoring estimates |
| `private/VIDEO.md` | Private repo | Demo video script and voice-over |
| `private/SUBMISSION.md` | Private repo | Form answers and the X post draft |
| `private/notes/` | Private repo | Research, decisions, server address and deploy notes |
| `.env`, keys, `~/.near-credentials`, database dumps | Neither | Secrets live only on the machines that use them |

`private/` is its own git repository (pushed to a separate **private** GitHub repo) and is listed in `.gitignore` here. Run `scripts/check-public.sh` before every push; `scripts/install-hooks.sh` installs it as a pre-push hook.

## Stack and layout

```
apps/web            React + Vite + React Three Fiber: the 3D town and the HUD
apps/server         Node 22 + TypeScript: rooms, scheduler, chat, Foreman agents, relayer, settlement
packages/economy    Pure, deterministic simulation. All rules in src/rules.ts
packages/shared     Shared types and the event catalog
contracts/millbrook Rust (near-sdk): NEP-245 items and coins, daily settlement, 10,000-coin invariant, no admin key
outlayer/game-master  The Game Master job that runs in an OutLayer enclave
infra/              docker-compose.yml (app, Postgres, Caddy) and Caddyfile
scripts/            Day-1 spikes, check-public.sh, install-hooks.sh, seed scripts
design/             Approved screens (sources, static HTML, screenshots) and original SVG art
docs/               Public docs for judges
e2e/                Playwright tests and screenshot checks
```

## Commands (keep these working; the README repeats them)

```
pnpm install
pnpm dev                         # web + server locally
pnpm test                        # unit tests, including the economy invariants
pnpm sim --seed 42 --days 28     # headless season, prints a report
pnpm e2e                         # Playwright, including the 60-second first session
pnpm contract:build && pnpm contract:test
pnpm contract:deploy:testnet     # testnet only
docker compose -f infra/docker-compose.yml up -d
```

## Working rules

- Build milestones in the order of `private/BUILD_PLAN.md`. A milestone is done only when its acceptance checks pass; then commit.
- `packages/economy` is pure and deterministic: a seeded random generator, no `Date.now()` or `Math.random()`, no input or output.
- Every economic rule lives in `packages/economy/src/rules.ts` and returns its reason as a short sentence for the tooltip.
- The invariant: total coins equal 10,000 after every tick and every settlement. Test it.
- Game on testnet only. Mainnet is used only for the human's prize payout account.
- The README lists only features that work in the deployed build. Everything else goes under "Roadmap". The AI judges (Claude Code and Codex) check the README against the running code.
- After any visual change, take Playwright screenshots at 1440x900 and 390x844 and review them against the `premium-game-ui` checklist.
- Assets: CC0 only, each recorded in `LICENSES.md`. Never copy a character, mascot or logo from another game or brand. The art in `design/assets/` is original to this project; reuse it rather than drawing new art.
- Screens: build each one to match its file in `design/screenshots/` and `design/static/`. Copy exact copy text, spacing and tokens. Change a design only to fix an issue listed in `design/README.md`, or after asking the human.
- Never say something works until you have run it.
- When a P0 task is at risk, tell the human and propose a cut from P2, then P1, as listed in the plan.
