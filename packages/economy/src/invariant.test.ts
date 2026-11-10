import { describe, it, expect } from "vitest";
import { TOTAL_COINS } from "@millbrook/shared";
import { createWorld } from "./state.js";
import { stepDay } from "./engine.js";
import type { AiStrategyId, SeasonConfig } from "./types.js";

/**
 * The headline invariant: the sum of every wallet equals the fixed 10,000
 * after every tick, for many seeds and across the different owner regimes and
 * the safety-net on/off settings. The engine also asserts this itself at the
 * end of each day, so any drift throws rather than slipping through.
 */
describe("coin invariant — total always 10,000", () => {
  const regimes: Array<Partial<SeasonConfig>> = [
    {},
    { forceAllOwners: "gus" as AiStrategyId },
    { forceAllOwners: "fern" as AiStrategyId },
    { forceAllOwners: "rita" as AiStrategyId },
    { safetyNet: false },
    { startUnemployment: 0.4 },
    { startUnemployment: 0.4, forceAllOwners: "gus" as AiStrategyId },
  ];

  it("holds for 100 seeds over a full 28-day season", () => {
    for (let seed = 0; seed < 100; seed++) {
      const world = createWorld({ seed, days: 28 });
      for (let d = 0; d < 28; d++) {
        stepDay(world);
        expect(world.ledger.total()).toBe(TOTAL_COINS);
      }
    }
  });

  it("holds under every owner regime and safety-net setting", () => {
    for (const regime of regimes) {
      for (let seed = 0; seed < 15; seed++) {
        const world = createWorld({ seed, days: 28, ...regime });
        for (let d = 0; d < 28; d++) stepDay(world);
        expect(world.ledger.total()).toBe(TOTAL_COINS);
      }
    }
  });

  it("never lets any single account go negative", () => {
    const world = createWorld({ seed: 3, days: 28, forceAllOwners: "gus" });
    for (let d = 0; d < 28; d++) {
      stepDay(world);
      for (const id of world.ledger.ids()) {
        expect(world.ledger.get(id)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
