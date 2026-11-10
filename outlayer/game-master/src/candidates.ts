/**
 * Pure candidate selection. Given a town snapshot and a weather reading, lists
 * the catalog events that are eligible right now, each with its parameters
 * already clamped to the hard caps in `@millbrook/shared`. The AI (or the
 * fallback) only ever *chooses among* these, so no decision can exceed a cap.
 */

import {
  GAME_MASTER_EVENTS,
  GAME_MASTER_LIMITS,
  type GameMasterEvent,
} from "@millbrook/shared";
import type { GmCandidate, GmParams, TownSnapshot, WeatherReading } from "./types.js";

/** Events wired for solo play (bank_panic/union_forms await loans/bargaining). */
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

function triggerActive(
  trigger: GameMasterEvent["trigger"],
  town: TownSnapshot,
  weather: WeatherReading,
): boolean {
  switch (trigger) {
    case "weather":
      return weather.condition === "heat" || weather.condition === "storm";
    case "price":
    case "random":
      return true;
    case "leader":
      return town.leaderCoins > Math.max(1, town.runnerUpCoins) * 1.3;
    case "stuck":
      return town.unemployment > 0.12;
    case "doing_well":
      return town.unemployment < 0.08 && town.avgWage >= 7;
    case "phase":
      return town.day >= GAME_MASTER_LIMITS.phase3ShockDay;
    case "low_wages":
      return town.avgWage > 0 && town.avgWage < 6;
  }
}

/** Clamp a requested duration to the event cap and the days left in the season. */
function capDays(town: TownSnapshot, requested: number, cap: number): number {
  const seasonLeft = Math.max(1, town.seasonDays - town.day);
  return Math.max(1, Math.min(requested, cap, seasonLeft));
}

function capUp(requested: number, cap: number | undefined): number {
  return cap ? Math.min(requested, cap) : requested;
}

/** The capped parameters for one event id. */
function paramsFor(def: GameMasterEvent, town: TownSnapshot): GmParams {
  const caps = def.caps;
  switch (def.id) {
    case "drought":
      return { rawGood: "wheat", rawPriceMultiplier: capUp(3, caps.maxPriceMultiplier), durationDays: capDays(town, 5, caps.maxDays) };
    case "bumper_harvest":
      return { rawGood: "wheat", rawPriceMultiplier: 0.5, durationDays: capDays(town, 3, caps.maxDays) };
    case "heatwave":
      return { outputMultiplier: 0.8, durationDays: capDays(town, 2, caps.maxDays) };
    case "cotton_blight":
      return { rawGood: "cotton", rawPriceMultiplier: capUp(2, caps.maxPriceMultiplier), durationDays: capDays(town, 4, caps.maxDays) };
    case "iron_shortage":
      return { rawGood: "iron", rawPriceMultiplier: capUp(2, caps.maxPriceMultiplier), durationDays: capDays(town, 4, caps.maxDays) };
    case "railway":
      return { breadPriceCeiling: 2, durationDays: capDays(town, 4, caps.maxDays) };
    case "festival":
      return { demandMultiplier: 2, durationDays: capDays(town, 1, caps.maxDays) };
    case "new_machine":
      return { workshopOutputMultiplier: 2, durationDays: capDays(town, 7, caps.maxDays) };
    case "migration_wave":
      return { oneTime: "migration_wave", durationDays: 1 };
    case "tax_inspector":
      return { oneTime: "tax_inspector", durationDays: 1 };
    default:
      return { durationDays: capDays(town, 1, caps.maxDays) };
  }
}

/** The events that may fire right now, each already capped. */
export function eligibleCandidates(town: TownSnapshot, weather: WeatherReading): GmCandidate[] {
  return GAME_MASTER_EVENTS.filter(
    (e) => SOLO_EVENT_IDS.has(e.id) && town.day >= e.minPhaseDay && triggerActive(e.trigger, town, weather),
  ).map((e) => ({
    id: e.id,
    title: e.title,
    effect: e.effect,
    trigger: e.trigger,
    params: paramsFor(e, town),
  }));
}

/** Is the once-a-week window open (or is this the Phase-3 shock)? */
export function mayFire(town: TownSnapshot): boolean {
  const weekly = town.daysSinceLastEvent >= GAME_MASTER_LIMITS.gameWeekDays;
  const phase3Shock = town.day === GAME_MASTER_LIMITS.phase3ShockDay;
  return weekly || phase3Shock;
}
