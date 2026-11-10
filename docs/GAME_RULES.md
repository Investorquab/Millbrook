# Game rules

The numbers that drive the simulation live in `packages/economy/src/rules.ts`, and
every rule returns its reason as a short sentence for the in-game tooltip. This is the
human-readable summary.

## The money

The town holds a fixed **10,000 coins**. At the start of a season:

| Holder | Coins |
| --- | --- |
| 30 residents (≈100 each) | 3,000 |
| Workshops (split across the open slots) | 4,000 |
| Town Co-op (farms, fields, mine, forest) | 2,500 |
| Town Hall treasury | 500 |

Every coin moves in a loop: businesses pay wages → residents spend wages at
businesses → businesses buy raw materials from the Co-op → the Co-op pays its own
workers. Nothing outside the contract can create or destroy a coin.

## A game day

Four steps: **dawn** (owners set wages/prices, the labour market and public works
run), **noon** (production and raw-material buying), **dusk** (wages, taxes and
settlement), **night** (residents shop). The coin invariant is asserted at the end of
every day.

A season is always **28 game days**. New rules switch on at day 10 (Competition) and
day 20 (Industrial), so a quiet early game gives way to fresh problems.

## Workshops (Phase 1)

| Workshop | Input | Output / worker / day | Main buyers |
| --- | --- | --- | --- |
| Bakery | Wheat | 10 bread (15 with tools) | Residents, daily |
| Weaver | Cotton | 3 cloth | Tailor, residents |
| Smithy | Iron | 1 tool | Every workshop |
| Brewery | Wheat | 6 ale | Tavern, residents |

(Tailor, Tavern, Carpenter and Apothecary are Phase-2 workshops in the catalog.)

## Residents

- **Needs:** 1 bread a day, 1 cloth a week (clothes every two weeks once the Tailor
  opens).
- **Budget:** today's wage plus a slice of savings above a per-trait rainy-day target
  — so money keeps circulating instead of draining to one side.
- **Where they shop:** the cheapest seller with stock; loyalty to a fair employer
  breaks ties.
- **Jobs:** a resident moves when another offer beats their wage by at least 1 coin.
- **Strikes:** pay under 80% of the town average for 5 days and the workers strike.
- **Migration:** the long-term jobless with almost nothing leave; newcomers arrive
  when wages are high and unemployment is low.

## AI owners

Four strategies, each in one readable file: **Greedy Gus** (squeeze wages, raise
prices), **Fair Fern** (pay well, price fairly), **Steady Sam** (cautious), **Risky
Rita** (bold bets). An all-greedy town tips into recession; an all-fair town pays more
but draws in migrants.

## The safety net

The Town Hall taxes payroll and sales, pays unemployment benefit, and funds public
works when unemployment is high — all sized to what the treasury can sustain, so it
never goes bankrupt. These automatic stabilizers are what let a crashed town recover.

## Game Master events

At most one event a game week (plus one shock at the start of Phase 3), each within
hard caps the contract and the code enforce. Examples: **drought** (wheat up to 3× for
5 days), **heatwave** (output −20% for 2 days), **festival** (demand doubles for a
day), **railway** (an outside baker caps bread for 4 days), **tax inspector** (the
richest owner pays 10% into the Co-op — coins stay in town), **migration wave** (five
newcomers). No event can ever move coins between players or exceed its cap.

## Goal cards

A season is scored against a goal card — Tycoon (most profit) by default — with more
cards for employment, fairness and town health. The season ends with a scoreboard
ranking every owner.
