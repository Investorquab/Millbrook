/**
 * rules.ts — every economic rule and tunable number in one readable file.
 *
 * The design promises that each resident and owner decision returns its reason
 * as one short sentence for the in-game tooltip, so the functions here return
 * `Reasoned<T>` wherever a player could hover the result. The AI-owner
 * strategies live in `owners/`, but the numbers they share live here.
 *
 * Nothing in this file reads the clock or calls Math.random — determinism is a
 * hard requirement.
 */

import {
  TOTAL_COINS,
  type Good,
  type RawGood,
  type WorkshopType,
} from "@millbrook/shared";
import type { Rng } from "./rng.js";
import type {
  Reasoned,
  Resident,
  Trait,
  Workshop,
  World,
} from "./types.js";

// ── Starting money (sums to the fixed 10,000) ──────────────────────────────
export const STARTING_RESIDENTS = 30;
export const SAVINGS_PER_RESIDENT = 100; // 30 × 100 = 3,000
export const WORKSHOP_POOL_COINS = 4_000; // split across open workshops
export const COOP_START_COINS = 2_500;
export const TOWN_HALL_START_COINS = 500;

// Sanity: the four pools must equal the fixed supply.
export const _STARTING_TOTAL =
  STARTING_RESIDENTS * SAVINGS_PER_RESIDENT +
  WORKSHOP_POOL_COINS +
  COOP_START_COINS +
  TOWN_HALL_START_COINS;
if (_STARTING_TOTAL !== TOTAL_COINS) {
  throw new Error(`Starting coins ${_STARTING_TOTAL} ≠ ${TOTAL_COINS}`);
}

// ── Workshop definitions (outputs, inputs, defaults) ───────────────────────
export interface WorkshopDef {
  input: RawGood | Good | null;
  output: Good;
  /** Output units per worker per day without tools. */
  perWorker: number;
  /** Output units per worker per day with a tool. */
  perWorkerTools: number;
  /** Raw-material units consumed per unit of output. */
  inputPerOutput: number;
  defaultPrice: number;
  defaultWage: number;
  maxWorkers: number;
}

export const WORKSHOP_DEFS: Record<WorkshopType, WorkshopDef> = {
  bakery: { input: "wheat", output: "bread", perWorker: 10, perWorkerTools: 15, inputPerOutput: 0.4, defaultPrice: 2, defaultWage: 8, maxWorkers: 6 },
  weaver: { input: "cotton", output: "cloth", perWorker: 3, perWorkerTools: 5, inputPerOutput: 0.8, defaultPrice: 5, defaultWage: 8, maxWorkers: 6 },
  smithy: { input: "iron", output: "tool", perWorker: 1, perWorkerTools: 1.5, inputPerOutput: 1.5, defaultPrice: 12, defaultWage: 8, maxWorkers: 4 },
  brewery: { input: "wheat", output: "ale", perWorker: 6, perWorkerTools: 9, inputPerOutput: 0.6, defaultPrice: 3, defaultWage: 8, maxWorkers: 6 },
  tailor: { input: "cloth", output: "clothes", perWorker: 2, perWorkerTools: 3, inputPerOutput: 1.0, defaultPrice: 8, defaultWage: 8, maxWorkers: 4 },
  tavern: { input: "bread", output: "meal", perWorker: 12, perWorkerTools: 18, inputPerOutput: 0.5, defaultPrice: 4, defaultWage: 8, maxWorkers: 4 },
  carpenter: { input: "timber", output: "housepart", perWorker: 1, perWorkerTools: 1.5, inputPerOutput: 2.0, defaultPrice: 20, defaultWage: 8, maxWorkers: 4 },
  apothecary: { input: "herbs", output: "remedy", perWorker: 4, perWorkerTools: 6, inputPerOutput: 0.5, defaultPrice: 4, defaultWage: 8, maxWorkers: 4 },
};

export const RAW_BASE_PRICES: Record<RawGood, number> = {
  wheat: 1,
  cotton: 1,
  iron: 2,
  timber: 1,
  herbs: 1,
};

export const COOP_DEFAULT_WAGE = 7;
export const COOP_WORKER_COUNT = 6; // starting primary-sector crew
export const COOP_MIN_WORKERS = 3;
export const COOP_MAX_WORKERS = 15;

// ── Resident needs and wants ───────────────────────────────────────────────
export const BREAD_PER_DAY = 1;
export const CLOTH_EVERY_DAYS = 7;
export const CLOTHES_EVERY_DAYS = 14;
/**
 * Residents aim to keep their savings near a target that depends on their
 * trait, and spend anything above it on ale — the discretionary good that
 * recycles wages back into the town. Because savings mean-revert to the
 * target, the town's total savings don't drift, so money keeps circulating
 * instead of draining into (or out of) the owners' tills. Thrifty residents
 * hold more back; the ambitious spend sooner.
 */
export const TARGET_SAVINGS_BY_TRAIT: Record<Trait, number> = {
  thrifty: 110,
  loyal: 80,
  ambitious: 55,
};
/** A sanity cap on ale bought in one night, whatever the budget. */
export const ALE_MAX_PER_DAY = 10;

// ── Wages, strikes, jobs, migration ────────────────────────────────────────
export const BASE_WAGE = 8;
export const WAGE_FLOOR = 1;
export const STRIKE_WAGE_FRACTION = 0.8; // under 80% of town average…
export const STRIKE_TRIGGER_DAYS = 5; //    …for 5 days…
export const STRIKE_DURATION_DAYS = 2; //    …triggers a 2-day strike.
export const JOB_CHANGE_MIN_GAIN = 1; // switch jobs for +1 coin/day or more.

export const MIGRATION_OUT_UNEMPLOYED_DAYS = 5;
export const MIGRATION_OUT_SAVINGS = 10;
export const MIGRATION_OUT_HUNGRY_DAYS = 5;
export const MIGRATION_IN_WAGE = 9; // arrivals when the average wage is high…
export const MIGRATION_IN_UNEMPLOYMENT = 0.1; //  …and unemployment is low.

// ── Taxes and the safety net ───────────────────────────────────────────────
// Taxes are levied on each workshop's daily payroll and sales in aggregate, so
// they don't round down to zero the way a per-wage or per-sale tax would.
export const WAGE_TAX_RATE = 0.15;
export const SALES_TAX_RATE = 0.1;
export const UNEMPLOYMENT_BENEFIT = 3;
export const PUBLIC_WORKS_WAGE = 4;
export const PUBLIC_WORKS_TRIGGER_UNEMPLOYMENT = 0.12;
export const PUBLIC_WORKS_MAX_WORKERS = 15;

export const TOWN_HALL_PUBLIC_WORKS_EMPLOYER = "townhall";

// ───────────────────────────────────────────────────────────────────────────
// Economic helpers
// ───────────────────────────────────────────────────────────────────────────

/** Mean wage across open, solvent workshops (plus the Co-op), for comparisons. */
export function townAverageWage(world: World): number {
  const wages: number[] = [];
  for (const w of world.workshops.values()) {
    if (w.open && !w.bankrupt) wages.push(w.wage);
  }
  wages.push(world.coop.wage);
  if (wages.length === 0) return BASE_WAGE;
  return wages.reduce((a, b) => a + b, 0) / wages.length;
}

/** Reputation runs from −100 (Ruthless) to +100 (Fair). */
export const REPUTATION_MIN = -100;
export const REPUTATION_MAX = 100;

/**
 * How an owner's reputation drifts over one day (GAME_DESIGN "Reputation"): it
 * moves with the shop's wage against the town average, and takes a hit for a
 * layoff that day or workers on strike. Returns the (unclamped) daily delta and
 * a short reason for the tooltip. Pure — nothing in the sim reads reputation to
 * make decisions yet (that's roadmap), so this only scores behaviour.
 */
export function reputationStep(
  world: World,
  workshop: Workshop,
  flags: { laidOffToday: boolean },
): Reasoned<number> {
  if (workshop.bankrupt || !workshop.open) {
    return { value: 0, reason: "The shop is closed, so its standing holds." };
  }
  const avg = townAverageWage(world);
  const gap = workshop.wage - avg;
  // Pay vs the town average is the steady signal (±1.5 a day at the extremes).
  let delta = Math.max(-1.5, Math.min(1.5, gap * 0.8));
  const reasons: string[] = [];
  if (gap >= 0.5) reasons.push(`pays ${gap.toFixed(1)} above the town wage`);
  else if (gap <= -0.5) reasons.push(`pays ${(-gap).toFixed(1)} below it`);
  else reasons.push("pays about the town wage");
  if (flags.laidOffToday) {
    delta -= 3;
    reasons.push("laid a worker off today");
  }
  if (workshop.strikeDays > 0) {
    delta -= 2;
    reasons.push("has workers on strike");
  }
  const verb = delta > 0.05 ? "rose" : delta < -0.05 ? "fell" : "held";
  return { value: delta, reason: `Standing ${verb}: ${reasons.join(", ")}.` };
}

export function aliveResidents(world: World): Resident[] {
  return [...world.residents.values()].filter((r) => r.alive);
}

export function employedCount(world: World): number {
  return aliveResidents(world).filter((r) => r.employerId !== null).length;
}

export function unemploymentRate(world: World): number {
  const alive = aliveResidents(world);
  if (alive.length === 0) return 0;
  const unemployed = alive.filter((r) => r.employerId === null).length;
  return unemployed / alive.length;
}

export function outputPerWorker(w: Workshop, def: WorkshopDef): number {
  // Each tool lifts one worker to the with-tools rate.
  const withTools = Math.min(w.tools, w.workers.length);
  const without = w.workers.length - withTools;
  return withTools * def.perWorkerTools + without * def.perWorker;
}

// ───────────────────────────────────────────────────────────────────────────
// Resident rules (each returns its reason)
// ───────────────────────────────────────────────────────────────────────────

/** Today's spending budget: the day's wage plus 20% of prior savings. */
export function residentBudget(resident: Resident, savings: number): Reasoned<number> {
  const prior = Math.max(0, savings - resident.lastWage);
  const budget = Math.min(savings, resident.lastWage + Math.floor(0.2 * prior));
  const reason =
    resident.lastWage > 0
      ? `Spending today's ${resident.lastWage} wage plus a fifth of savings.`
      : `No wage today, so dipping into savings only.`;
  return { value: budget, reason };
}

/** Does the resident need cloth today (weekly)? */
export function needsCloth(resident: Resident, day: number): boolean {
  return day - resident.clothLastDay >= CLOTH_EVERY_DAYS;
}

/** Does the resident need clothes today (every two weeks, Tailor open)? */
export function needsClothes(resident: Resident, day: number, tailorOpen: boolean): boolean {
  return tailorOpen && day - resident.clothesLastDay >= CLOTHES_EVERY_DAYS;
}

/**
 * Choose where to buy a good: the cheapest open seller with stock. A good
 * reputation on the resident's own employer breaks ties (loyalty).
 */
export function chooseSeller(
  good: Good,
  world: World,
  resident: Resident,
): Reasoned<Workshop | null> {
  const sellers = [...world.workshops.values()].filter(
    (w) => w.open && !w.bankrupt && w.strikeDays === 0 && WORKSHOP_DEFS[w.type].output === good && w.outputStock >= 1,
  );
  if (sellers.length === 0) {
    return { value: null, reason: `No one has ${good} in stock today.` };
  }
  sellers.sort((a, b) => {
    if (a.price !== b.price) return a.price - b.price;
    // Tie-break: loyalty to the resident's own employer if its owner is fair.
    const aLoyal = a.id === resident.employerId ? 1 : 0;
    const bLoyal = b.id === resident.employerId ? 1 : 0;
    return bLoyal - aLoyal;
  });
  const chosen = sellers[0]!;
  return { value: chosen, reason: `Bought ${good} from the cheapest seller at ${chosen.price}.` };
}

/**
 * Would the resident change jobs? They move for an offer beating the current
 * wage by at least one coin a day. Returns the workshop to move to, or null.
 */
export function chooseJobChange(resident: Resident, world: World): Reasoned<Workshop | null> {
  const currentWage = currentEmployerWage(resident, world);
  let best: Workshop | null = null;
  let bestWage = currentWage;
  for (const w of world.workshops.values()) {
    if (!w.open || w.bankrupt) continue;
    if (w.id === resident.employerId) continue;
    if (w.workers.length >= w.maxWorkers) continue;
    if (w.wage >= bestWage + JOB_CHANGE_MIN_GAIN) {
      best = w;
      bestWage = w.wage;
    }
  }
  if (best) {
    return { value: best, reason: `Switching jobs: ${best.wage} a day beats ${currentWage}.` };
  }
  return { value: null, reason: `Staying put; no better offer than ${currentWage} a day.` };
}

function currentEmployerWage(resident: Resident, world: World): number {
  if (resident.employerId === null) return 0;
  const w = world.workshops.get(resident.employerId);
  if (w) return w.wage;
  if (resident.employerId === world.coop.id) return world.coop.wage;
  return PUBLIC_WORKS_WAGE; // public works
}

/**
 * Strike check for a workshop: paying under 80% of the town average for five
 * days straight makes its workers strike for two days.
 */
export function updateStrike(w: Workshop, world: World): Reasoned<boolean> {
  const avg = townAverageWage(world);
  const threshold = STRIKE_WAGE_FRACTION * avg;
  if (w.strikeDays > 0) {
    return { value: true, reason: `On strike for ${w.strikeDays} more day(s).` };
  }
  if (w.wage < threshold) {
    w.daysUnderpaid += 1;
  } else {
    w.daysUnderpaid = 0;
  }
  if (w.daysUnderpaid >= STRIKE_TRIGGER_DAYS && w.workers.length > 0) {
    w.strikeDays = STRIKE_DURATION_DAYS;
    w.daysUnderpaid = 0;
    return { value: true, reason: `Workers struck: ${w.wage} is below 80% of the ${avg.toFixed(0)} average.` };
  }
  return { value: false, reason: `Working; ${w.wage} is at or above the strike line.` };
}

/** Would this resident leave town today? */
export function shouldMigrateOut(resident: Resident, savings: number): Reasoned<boolean> {
  if (
    resident.employerId === null &&
    resident.daysUnemployed >= MIGRATION_OUT_UNEMPLOYED_DAYS &&
    savings < MIGRATION_OUT_SAVINGS
  ) {
    return { value: true, reason: `Left town: jobless ${resident.daysUnemployed} days with ${savings} coins.` };
  }
  if (resident.hungryDays >= MIGRATION_OUT_HUNGRY_DAYS) {
    return { value: true, reason: `Left town: hungry ${resident.hungryDays} days running.` };
  }
  return { value: false, reason: `Staying in Millbrook for now.` };
}

/** How many new residents arrive today (town doing well)? */
export function migrationInCount(world: World, rng: Rng): Reasoned<number> {
  const avg = townAverageWage(world);
  const unemployment = unemploymentRate(world);
  if (avg >= MIGRATION_IN_WAGE && unemployment < MIGRATION_IN_UNEMPLOYMENT) {
    // A trickle: 0–2 arrivals when times are good.
    const n = rng.int(0, 2);
    return { value: n, reason: `${n} arrived: wages are ${avg.toFixed(0)} and work is easy to find.` };
  }
  return { value: 0, reason: `No arrivals; the town isn't pulling people in.` };
}

// ── Taxes (levied in aggregate at dusk; always an integer) ─────────────────

/** The Town Hall's cut of a day's total payroll at one workshop. */
export function payrollTax(totalPayroll: number): number {
  return Math.floor(totalPayroll * WAGE_TAX_RATE);
}

/** The Town Hall's cut of a day's total sales at one workshop. */
export function salesTax(totalSales: number): number {
  return Math.floor(totalSales * SALES_TAX_RATE);
}
