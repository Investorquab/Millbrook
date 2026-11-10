import { describe, it, expect } from "vitest";
import { runSeasonReport } from "./sim.js";
import { createWorld } from "./state.js";
import { stepDay } from "./engine.js";

/** Same seed, same season — a hard requirement for the pure engine. */
describe("determinism", () => {
  it("produces identical metrics and feed for the same seed", () => {
    const a = runSeasonReport({ seed: 42, days: 28 });
    const b = runSeasonReport({ seed: 42, days: 28 });
    expect(a.metrics).toEqual(b.metrics);
    expect(a.feed).toEqual(b.feed);
    expect(a.summary).toEqual(b.summary);
  });

  it("does not leak state between seasons run in the same process", () => {
    // Running an unrelated season first must not change a later one.
    runSeasonReport({ seed: 1, days: 28, forceAllOwners: "gus" });
    const a = runSeasonReport({ seed: 99, days: 28 });
    const b = runSeasonReport({ seed: 99, days: 28 });
    expect(a.metrics).toEqual(b.metrics);
  });

  it("different seeds give different seasons", () => {
    const a = runSeasonReport({ seed: 1, days: 28 });
    const b = runSeasonReport({ seed: 2, days: 28 });
    expect(a.metrics).not.toEqual(b.metrics);
  });

  it("stepping day by day matches running the whole season", () => {
    const whole = runSeasonReport({ seed: 7, days: 28 });
    const world = createWorld({ seed: 7, days: 28 });
    for (let d = 0; d < 28; d++) stepDay(world);
    expect(world.metrics).toEqual(whole.metrics);
  });
});
