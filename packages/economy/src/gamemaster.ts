/**
 * The Game Master (M4) — pure and deterministic.
 *
 * Each game day it reads the town's metrics and a weather reading, and may fire
 * one event from the fixed catalog in `@millbrook/shared`, always within the
 * catalog's hard caps and the global limits (at most one event per game week,
 * plus one shock at the start of Phase 3). Events only ever change prices,
 * output, demand or add arrivals; the single coin-moving event (the tax
 * inspector) pays into the Town Co-op, so the 10,000-coin total is preserved
 * and money never moves between players.
 *
 * This core takes no keys and no network: the OutLayer enclave job wraps it to
 * add a real weather feed, a NEAR-AI reasoning paragraph and an on-chain
 * receipt, but the *choice and the caps live here*, so "the AI can never exceed
 * a cap" is true by construction and proven by the unit tests. When there is no
 * live feed, the weather is derived from town metrics and every event says so.
 */

import {
  GAME_MASTER_EVENTS,
  GAME_MASTER_LIMITS,
  TOWN_HALL_ID,
  type GameMasterEvent,
  type RawGood,
  type WorkshopType,
} from "@millbrook/shared";
import type { Rng } from "./rng.js";
import { townAverageWage, unemploymentRate } from "./rules.js";
import type { ActiveGmEvent, FiredGmEvent, WeatherReading, World } from "./types.js";

/** The events the Game Master actually runs in solo mode. `bank_panic` (needs
 *  loans) and `union_forms` (needs collective bargaining) stay in the catalog
 *  but are not yet wired, so the GM never picks them here. */
const SOLO_EVENT_IDS = new Set([
  "drought",
  "bumper_harvest",
  "heatwave",
  "railway",
  "tax_inspector",
  "new_machine",
  "festival",
  "cotton_blight",
  "iron_shortage",
  "migration_wave",
]);

/** Metrics the Game Master reads, and surfaces on the "Why did this happen?" card. */
export interface GmMetrics {
  day: number;
  phaseDay: number;
  unemployment: number;
  avgWage: number;
  wheatPrice: number;
  leaderCoins: number;
  runnerUpCoins: number;
  daysSinceLastEvent: number;
}

export function readGmMetrics(world: World): GmMetrics {
  const workshopCoins = [...world.workshops.values()]
    .filter((w) => w.open && !w.bankrupt)
    .map((w) => world.ledger.get(w.id))
    .sort((a, b) => b - a);
  return {
    day: world.day,
    phaseDay: world.day,
    unemployment: unemploymentRate(world),
    avgWage: townAverageWage(world),
    wheatPrice: world.coop.rawPrices.wheat,
    leaderCoins: workshopCoins[0] ?? 0,
    runnerUpCoins: workshopCoins[1] ?? 0,
    daysSinceLastEvent: Number.isFinite(world.gm.lastEventDay)
      ? world.day - world.gm.lastEventDay
      : Number.POSITIVE_INFINITY,
  };
}

/** Deterministic weather from the rng, used when there is no live feed. */
export function deriveWeather(rng: Rng): WeatherReading {
  const tempC = rng.int(14, 38);
  const roll = rng.int(0, 99);
  const condition: WeatherReading["condition"] =
    tempC >= 32 ? "heat" : roll < 12 ? "storm" : "calm";
  return {
    tempC,
    condition,
    source: "metrics",
    label: "derived from town metrics (no live weather feed)",
  };
}

// ── Caps ─────────────────────────────────────────────────────────────────────

/** Clamp a requested duration to the event's cap and the days left in the season. */
function capDays(world: World, requested: number, cap: number): number {
  const seasonLeft = Math.max(1, world.config.days - world.day);
  return Math.max(1, Math.min(requested, cap, seasonLeft));
}

/** Clamp an "up" price multiplier so it never exceeds the catalog cap. */
function capUpMultiplier(requested: number, cap: number | undefined): number {
  return cap ? Math.min(requested, cap) : requested;
}

// ── Eligibility ──────────────────────────────────────────────────────────────

function triggerActive(
  trigger: GameMasterEvent["trigger"],
  m: GmMetrics,
  weather: WeatherReading,
): boolean {
  switch (trigger) {
    case "weather":
      return weather.condition === "heat" || weather.condition === "storm";
    case "price":
      return true; // a price feed would gate this; metrics fallback lets it through
    case "random":
      return true;
    case "leader":
      // Someone is clearly ahead of the pack.
      return m.leaderCoins > Math.max(1, m.runnerUpCoins) * 1.3;
    case "stuck":
      return m.unemployment > 0.12;
    case "doing_well":
      return m.unemployment < 0.08 && m.avgWage >= 7;
    case "phase":
      return m.day >= GAME_MASTER_LIMITS.phase3ShockDay;
    case "low_wages":
      return m.avgWage > 0 && m.avgWage < 6;
  }
}

function eligibleEvents(world: World, m: GmMetrics, weather: WeatherReading): GameMasterEvent[] {
  return GAME_MASTER_EVENTS.filter(
    (e) =>
      SOLO_EVENT_IDS.has(e.id) &&
      world.day >= e.minPhaseDay &&
      triggerActive(e.trigger, m, weather),
  );
}

// ── Choosing + capping an event ──────────────────────────────────────────────

interface ChosenEvent {
  def: GameMasterEvent;
  active: ActiveGmEvent;
  reason: string;
  data: Record<string, number | string>;
  source: WeatherReading["source"];
  /** A one-time effect to run at fire time (tax inspector, migration wave). */
  oneTime?: (world: World) => Record<string, number | string>;
}

function buildChosen(world: World, def: GameMasterEvent, m: GmMetrics, weather: WeatherReading): ChosenEvent {
  const base = (remainingDays: number, params: ActiveGmEvent["params"]): ActiveGmEvent => ({
    id: def.id,
    title: def.title,
    effect: def.effect,
    startDay: world.day,
    remainingDays,
    params,
  });
  const weatherNote =
    weather.source === "feed"
      ? `Weather feed (${weather.label}) read ${weather.tempC}°C, ${weather.condition}.`
      : `No live weather feed; ${weather.label}. Read ${weather.tempC}°C, ${weather.condition}.`;
  const data = (extra: Record<string, number | string>): Record<string, number | string> => ({
    day: world.day,
    unemployment: Number(m.unemployment.toFixed(3)),
    avgWage: Number(m.avgWage.toFixed(2)),
    wheatPrice: m.wheatPrice,
    tempC: weather.tempC,
    weather: weather.condition,
    weatherSource: weather.source,
    ...extra,
  });

  switch (def.id) {
    case "drought": {
      const mult = capUpMultiplier(3, def.caps.maxPriceMultiplier);
      const days = capDays(world, 5, def.caps.maxDays);
      return {
        def, source: weather.source,
        active: base(days, { rawGood: "wheat", rawPriceMultiplier: mult }),
        reason: `${weatherNote} A drought pushes wheat to ${mult}× its price for ${days} days.`,
        data: data({ wheatMultiplier: mult, days }),
      };
    }
    case "bumper_harvest": {
      const days = capDays(world, 3, def.caps.maxDays);
      return {
        def, source: weather.source,
        active: base(days, { rawGood: "wheat", rawPriceMultiplier: 0.5 }),
        reason: `A bumper harvest halves the wheat price for ${days} days.`,
        data: data({ wheatMultiplier: 0.5, days }),
      };
    }
    case "heatwave": {
      const days = capDays(world, 2, def.caps.maxDays);
      return {
        def, source: weather.source,
        active: base(days, { outputMultiplier: 0.8 }),
        reason: `${weatherNote} In the heat, every worker produces 20% less for ${days} days.`,
        data: data({ outputMultiplier: 0.8, days }),
      };
    }
    case "cotton_blight": {
      const mult = capUpMultiplier(2, def.caps.maxPriceMultiplier);
      const days = capDays(world, 4, def.caps.maxDays);
      return {
        def, source: weather.source,
        active: base(days, { rawGood: "cotton", rawPriceMultiplier: mult }),
        reason: `A cotton blight cuts supply; cotton costs ${mult}× for ${days} days.`,
        data: data({ cottonMultiplier: mult, days }),
      };
    }
    case "iron_shortage": {
      const mult = capUpMultiplier(2, def.caps.maxPriceMultiplier);
      const days = capDays(world, 4, def.caps.maxDays);
      return {
        def, source: weather.source,
        active: base(days, { rawGood: "iron", rawPriceMultiplier: mult }),
        reason: `An iron shortage makes tools dearer; iron costs ${mult}× for ${days} days.`,
        data: data({ ironMultiplier: mult, days }),
      };
    }
    case "railway": {
      const days = capDays(world, 4, def.caps.maxDays);
      const ceiling = 2;
      return {
        def, source: weather.source,
        active: base(days, { breadPriceCeiling: ceiling }),
        reason: `The leader is ${(m.leaderCoins / Math.max(1, m.runnerUpCoins)).toFixed(1)}× ahead, so a railway brings an outside baker: bread is capped at ${ceiling} coins for ${days} days.`,
        data: data({ breadPriceCeiling: ceiling, days, leaderCoins: m.leaderCoins }),
      };
    }
    case "festival": {
      const days = capDays(world, 1, def.caps.maxDays);
      return {
        def, source: weather.source,
        active: base(days, { demandMultiplier: 2 }),
        reason: `Unemployment is ${(m.unemployment * 100).toFixed(0)}% and the town is stuck, so a festival doubles demand for ${days} day.`,
        data: data({ demandMultiplier: 2, days }),
      };
    }
    case "new_machine": {
      const days = capDays(world, 7, def.caps.maxDays);
      const target = pickOpenWorkshopType(world);
      return {
        def, source: weather.source,
        active: base(days, { workshopType: target ?? undefined, workshopOutputMultiplier: 2 }),
        reason: `Phase 3: a new machine doubles the ${target ?? "lead"} workshop's output for ${days} days.`,
        data: data({ workshop: target ?? "n/a", outputMultiplier: 2, days }),
      };
    }
    case "migration_wave": {
      return {
        def, source: weather.source,
        active: base(1, {}),
        reason: `Unemployment is only ${(m.unemployment * 100).toFixed(0)}% and wages average ${m.avgWage.toFixed(1)}, so five newcomers arrive looking for work.`,
        data: data({ arrivals: 5 }),
        oneTime: (w) => ({ arrivals: migrationWave(w, 5) }),
      };
    }
    case "tax_inspector": {
      return {
        def, source: weather.source,
        active: base(1, {}),
        reason: `The leader holds ${m.leaderCoins} coins, so the tax inspector takes 10% from the richest owner into the Town Co-op (the coins stay in Millbrook).`,
        data: data({ leaderCoins: m.leaderCoins }),
        oneTime: (w) => taxInspector(w),
      };
    }
    default:
      // Should not happen: SOLO_EVENT_IDS and this switch are kept in step.
      return {
        def, source: weather.source,
        active: base(1, {}),
        reason: def.effect,
        data: data({}),
      };
  }
}

function pickOpenWorkshopType(world: World): WorkshopType | null {
  const open = [...world.workshops.values()].filter((w) => w.open && !w.bankrupt);
  if (open.length === 0) return null;
  return open[world.rng.int(0, open.length - 1)]!.type;
}

// ── One-time, invariant-safe effects ─────────────────────────────────────────

/** The tax inspector: the richest open workshop pays 10% into the Town Co-op.
 *  A pure transfer — coins stay in Millbrook and never move between players. */
function taxInspector(world: World): Record<string, number | string> {
  let richest = null as null | { id: string; coins: number };
  for (const w of world.workshops.values()) {
    if (!w.open || w.bankrupt) continue;
    const coins = world.ledger.get(w.id);
    if (!richest || coins > richest.coins) richest = { id: w.id, coins };
  }
  if (!richest) return { taxed: 0 };
  const due = Math.floor(richest.coins * 0.1);
  const paid = world.ledger.payUpTo(richest.id, world.coop.id, due);
  return { taxedWorkshop: richest.id, taxed: paid, into: world.coop.id };
}

/** A migration wave: `n` arrivals, each with a small Town-Hall stipend. Coins
 *  come from the treasury, so the total is unchanged. */
function migrationWave(world: World, n: number): number {
  for (let i = 0; i < n; i++) {
    const id = `r${world.nextResidentNumber++}`;
    world.ledger.ensure(id);
    const stipend = world.ledger.payUpTo(TOWN_HALL_ID, id, 20);
    world.residents.set(id, {
      id,
      name: `Newcomer ${world.nextResidentNumber}`,
      trait: world.rng.pick(["thrifty", "loyal", "ambitious"]),
      age: world.rng.int(18, 50),
      retired: false,
      employerId: null,
      lastWage: stipend,
      daysUnemployed: 0,
      clothLastDay: world.day,
      clothesLastDay: world.day,
      ateToday: false,
      hungryDays: 0,
      alive: true,
      lastReason: "Arrived in Millbrook on the migration wave.",
    });
  }
  return n;
}

// ── Orchestration ────────────────────────────────────────────────────────────

/**
 * Advance the Game Master one game day. Expires finished effects, then — if the
 * weekly limit allows (or it is the Phase-3 shock) — may fire one new event.
 * Pass a real `weather` reading to act on a live feed; otherwise it is derived
 * deterministically from the rng. Does nothing (and draws no rng) when the Game
 * Master is disabled, so headless sims stay byte-for-byte reproducible.
 */
export function runGameMaster(world: World, weather?: WeatherReading): FiredGmEvent | null {
  if (!world.gm.enabled) return null;

  // 1) Expire yesterday's effects.
  for (const e of world.gm.active) e.remainingDays -= 1;
  world.gm.active = world.gm.active.filter((e) => e.remainingDays > 0);

  const w = weather ?? deriveWeather(world.rng);
  const m = readGmMetrics(world);

  // 2) Decide whether an event may fire today.
  const isPhase3Shock =
    world.day === GAME_MASTER_LIMITS.phase3ShockDay && !world.gm.phase3ShockDone;
  const weeklyWindowOpen = m.daysSinceLastEvent >= GAME_MASTER_LIMITS.gameWeekDays;

  if (!isPhase3Shock) {
    if (!weeklyWindowOpen) return null;
    // Within the window, fire roughly half the eligible days so events feel
    // occasional rather than clockwork.
    if (world.rng.int(0, 99) >= 50) return null;
  }

  const candidates = eligibleEvents(world, m, w);
  // On the Phase-3 shock, prefer a dramatic, phase-appropriate event.
  const pool = isPhase3Shock
    ? candidates.filter((e) => e.id === "new_machine" || e.id === "drought").concat(candidates)
    : candidates;
  if (pool.length === 0) return null;

  const def = pool[world.rng.int(0, pool.length - 1)]!;
  const chosen = buildChosen(world, def, m, w);

  return fireGmEvent(world, chosen, isPhase3Shock);
}

function fireGmEvent(world: World, chosen: ChosenEvent, isPhase3Shock: boolean): FiredGmEvent {
  let data = chosen.data;
  if (chosen.oneTime) {
    data = { ...data, ...chosen.oneTime(world) };
  }
  // Only keep a lingering effect if it actually has parameters.
  if (Object.keys(chosen.active.params).length > 0) {
    world.gm.active.push(chosen.active);
  }
  world.gm.lastEventDay = world.day;
  if (isPhase3Shock) world.gm.phase3ShockDone = true;

  const fired: FiredGmEvent = {
    day: world.day,
    id: chosen.def.id,
    title: chosen.def.title,
    effect: chosen.def.effect,
    reason: chosen.reason,
    data,
    source: chosen.source,
  };
  world.gm.log.push(fired);
  return fired;
}

// ── Effect accessors the engine reads ────────────────────────────────────────

export function rawPriceFactor(world: World, good: RawGood): number {
  let f = 1;
  for (const e of world.gm.active) {
    if (e.params.rawGood === good && e.params.rawPriceMultiplier) f *= e.params.rawPriceMultiplier;
  }
  return f;
}

export function outputFactor(world: World): number {
  let f = 1;
  for (const e of world.gm.active) {
    if (e.params.outputMultiplier) f *= e.params.outputMultiplier;
  }
  return f;
}

export function workshopOutputFactor(world: World, type: WorkshopType): number {
  let f = 1;
  for (const e of world.gm.active) {
    if (e.params.workshopType === type && e.params.workshopOutputMultiplier) {
      f *= e.params.workshopOutputMultiplier;
    }
  }
  return f;
}

export function demandFactor(world: World): number {
  let f = 1;
  for (const e of world.gm.active) {
    if (e.params.demandMultiplier) f *= e.params.demandMultiplier;
  }
  return f;
}

export function breadPriceCeiling(world: World): number {
  let ceiling = Number.POSITIVE_INFINITY;
  for (const e of world.gm.active) {
    if (e.params.breadPriceCeiling !== undefined) ceiling = Math.min(ceiling, e.params.breadPriceCeiling);
  }
  return ceiling;
}

/** Used by tests/UI: is a given effect currently active? */
export function activeGmEventIds(world: World): string[] {
  return world.gm.active.map((e) => e.id);
}
