/**
 * Goods, workshops and the season phases. These are stable identifiers used
 * across the whole project (engine, contract item ids, UI labels). The numbers
 * that drive the simulation (outputs, prices, needs) live in the economy
 * package's `rules.ts`, not here.
 */

/** Raw materials sold by the Town Co-op. */
export const RAW_GOODS = ["wheat", "cotton", "iron", "timber", "herbs"] as const;
export type RawGood = (typeof RAW_GOODS)[number];

/** Finished goods made by the workshops. */
export const FINISHED_GOODS = [
  "bread",
  "cloth",
  "tool",
  "ale",
  "clothes",
  "meal",
  "housepart",
  "remedy",
] as const;
export type FinishedGood = (typeof FINISHED_GOODS)[number];

export type Good = RawGood | FinishedGood;
export const ALL_GOODS: readonly Good[] = [...RAW_GOODS, ...FINISHED_GOODS];

export function isRawGood(g: Good): g is RawGood {
  return (RAW_GOODS as readonly string[]).includes(g);
}

/** The eight workshop types. Each town opens 4–6 of them. */
export const WORKSHOP_TYPES = [
  "bakery",
  "weaver",
  "smithy",
  "brewery",
  "tailor",
  "tavern",
  "carpenter",
  "apothecary",
] as const;
export type WorkshopType = (typeof WORKSHOP_TYPES)[number];

/** The four Phase-1 (core, P0) workshops. */
export const PHASE1_WORKSHOPS: readonly WorkshopType[] = [
  "bakery",
  "weaver",
  "smithy",
  "brewery",
];

/**
 * A season is always 28 game days. New rules switch on at day 10 and day 20,
 * so a player who coasted through Settling meets fresh problems later.
 */
export type Phase = "settling" | "competition" | "industrial";

export const PHASE_BOUNDARIES = { competition: 10, industrial: 20 } as const;

export function phaseForDay(day: number): Phase {
  if (day >= PHASE_BOUNDARIES.industrial) return "industrial";
  if (day >= PHASE_BOUNDARIES.competition) return "competition";
  return "settling";
}

/** The four steps of every game day. */
export const DAY_STEPS = ["dawn", "noon", "dusk", "night"] as const;
export type DayStep = (typeof DAY_STEPS)[number];

export const SEASON_DAYS = 28;

/** Fixed total money supply, enforced by the NEAR contract. */
export const TOTAL_COINS = 10_000;

/** Special (non-player, non-workshop) account ids inside the economy ledger. */
export const COOP_ID = "coop";
export const TOWN_HALL_ID = "townhall";
