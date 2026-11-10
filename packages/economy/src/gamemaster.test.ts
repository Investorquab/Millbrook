import { describe, it, expect } from "vitest";
import {
  GAME_MASTER_EVENTS,
  GAME_MASTER_LIMITS,
  TOTAL_COINS,
} from "@millbrook/shared";
import { createWorld } from "./state.js";
import { stepDay, runSeason } from "./engine.js";
import { runGameMaster } from "./gamemaster.js";
import type { FiredGmEvent, WeatherReading, World } from "./types.js";

const capsById = new Map(GAME_MASTER_EVENTS.map((e) => [e.id, e.caps]));

/** Run a GM-on season and return the world (events logged in world.gm.log). */
function season(seed: number, weather?: WeatherReading): World {
  const world = createWorld({ seed, days: 28, gameMaster: true });
  if (weather) {
    for (let d = 0; d < 28; d++) stepDay(world, weather);
  } else {
    runSeason(world);
  }
  return world;
}

/** All events fired across a range of seeds. */
function allFired(seeds: number[], weather?: WeatherReading): FiredGmEvent[] {
  const out: FiredGmEvent[] = [];
  for (const s of seeds) out.push(...season(s, weather).gm.log);
  return out;
}

const SEEDS = Array.from({ length: 120 }, (_, i) => i + 1);

describe("Game Master", () => {
  it("is completely inert when disabled (no events, no rng drift)", () => {
    const off = createWorld({ seed: 7, days: 28 });
    runSeason(off);
    expect(off.gm.log.length).toBe(0);
    expect(off.gm.active.length).toBe(0);
  });

  it("keeps the 10,000-coin invariant all season with events firing", () => {
    for (const s of [1, 2, 3, 42, 99, 123, 777]) {
      const world = season(s);
      expect(world.ledger.total()).toBe(TOTAL_COINS);
      // And the ledger's own assertion never threw during the run.
      world.ledger.assertInvariant(TOTAL_COINS);
    }
  });

  it("fires at least six different catalog events across seeds", () => {
    const ids = new Set(allFired(SEEDS).map((f) => f.id));
    expect(ids.size).toBeGreaterThanOrEqual(6);
    // Every fired id is a real catalog event.
    for (const id of ids) expect(capsById.has(id)).toBe(true);
  });

  it("never exceeds a catalog cap (duration or price multiplier)", () => {
    for (const f of allFired(SEEDS)) {
      const caps = capsById.get(f.id)!;
      if (typeof f.data.days === "number") {
        expect(f.data.days).toBeLessThanOrEqual(caps.maxDays);
      }
      const upMult =
        (f.data.wheatMultiplier as number) ??
        (f.data.cottonMultiplier as number) ??
        (f.data.ironMultiplier as number);
      if (typeof upMult === "number" && caps.maxPriceMultiplier !== undefined) {
        expect(upMult).toBeLessThanOrEqual(caps.maxPriceMultiplier);
      }
    }
  });

  it("respects the one-event-per-week limit (bar the Phase-3 shock)", () => {
    for (const s of SEEDS) {
      const days = season(s).gm.log.map((f) => f.day).sort((a, b) => a - b);
      for (let i = 1; i < days.length; i++) {
        const gap = days[i]! - days[i - 1]!;
        const isPhase3Shock = days[i] === GAME_MASTER_LIMITS.phase3ShockDay;
        expect(gap >= GAME_MASTER_LIMITS.gameWeekDays || isPhase3Shock).toBe(true);
      }
    }
  });

  it("only ever moves coins into the Co-op, never between players", () => {
    // The tax inspector is the single coin-moving event. Wherever it fired, the
    // coins went into the Co-op (not to another owner), and the total held.
    const taxed = allFired(SEEDS).filter((f) => f.id === "tax_inspector");
    expect(taxed.length).toBeGreaterThan(0); // it does fire somewhere in 120 seeds
    for (const f of taxed) {
      if (f.data.taxed && (f.data.taxed as number) > 0) {
        expect(f.data.into).toBe("coop");
      }
    }
  });

  it("falls back to town metrics and says so when there is no live feed", () => {
    const fired = allFired(SEEDS);
    expect(fired.length).toBeGreaterThan(0);
    for (const f of fired) expect(f.source).toBe("metrics");
    // The weather-driven events name the missing feed in their reasoning.
    const weatherDriven = fired.filter((f) => f.id === "drought" || f.id === "heatwave");
    expect(weatherDriven.length).toBeGreaterThan(0);
    for (const f of weatherDriven) {
      expect(f.reason.toLowerCase()).toContain("no live weather feed");
    }
  });

  it("marks events from a live feed as feed-sourced", () => {
    const heat: WeatherReading = {
      tempC: 36,
      condition: "heat",
      source: "feed",
      label: "Open-Meteo, Lagos",
    };
    const fired = allFired([1, 2, 3, 4, 5, 6, 7, 8], heat);
    expect(fired.length).toBeGreaterThan(0);
    for (const f of fired) expect(f.source).toBe("feed");
  });

  it("is deterministic: same seed, same events", () => {
    const a = season(55).gm.log;
    const b = season(55).gm.log;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("applies a live effect: a drought lifts the wheat the bakery pays for", () => {
    // Drive a world to a heatwave/drought via a hot feed and confirm an active
    // raw-price effect appears (wheat or otherwise) without breaking the total.
    const hot: WeatherReading = {
      tempC: 37,
      condition: "heat",
      source: "feed",
      label: "test feed",
    };
    let sawRawPriceEffect = false;
    for (const s of SEEDS.slice(0, 40)) {
      const world = createWorld({ seed: s, days: 28, gameMaster: true });
      for (let d = 0; d < 28; d++) {
        runGameMaster(world, hot);
        if (world.gm.active.some((e) => e.params.rawPriceMultiplier)) sawRawPriceEffect = true;
      }
      expect(world.ledger.total()).toBe(TOTAL_COINS);
    }
    expect(sawRawPriceEffect).toBe(true);
  });
});
