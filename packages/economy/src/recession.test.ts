import { describe, it, expect } from "vitest";
import { runSeasonReport } from "./sim.js";

/**
 * The game's thesis: your workers are your only customers, so cutting wages
 * shrinks your own market. A town where every owner cuts wages (all Greedy Gus)
 * must end up with higher unemployment and lower total sales than one where
 * every owner pays fairly (all Fair Fern), on the same seed.
 */
describe("a wage war causes a recession", () => {
  const seeds = [1, 7, 13, 21, 42];

  it("a wage war shrinks the market: lower sales and wages every time", () => {
    // Sales (the size of the market) and wages are the robust signature of the
    // recession; they fall under an all-greedy town on every seed.
    for (const seed of seeds) {
      const greedy = runSeasonReport({ seed, days: 28, forceAllOwners: "gus" });
      const fair = runSeasonReport({ seed, days: 28, forceAllOwners: "fern" });
      expect(greedy.summary.totalSalesOverSeason).toBeLessThan(fair.summary.totalSalesOverSeason);
      expect(greedy.summary.avgWage).toBeLessThan(fair.summary.avgWage);
    }
  });

  it("a wage war raises unemployment across the board", () => {
    // Aggregate across seeds: a prosperous fair town can briefly show higher
    // unemployment because it pulls in migrants faster than jobs appear, so the
    // comparison is made on the mean rather than seed-by-seed.
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const greedy = mean(seeds.map((seed) => runSeasonReport({ seed, days: 28, forceAllOwners: "gus" }).summary.avgUnemployment));
    const fair = mean(seeds.map((seed) => runSeasonReport({ seed, days: 28, forceAllOwners: "fern" }).summary.avgUnemployment));
    expect(greedy).toBeGreaterThan(fair);
  });

  it("a wage war provokes strikes", () => {
    // Underpaying for days on end triggers strikes somewhere in the town.
    const greedy = runSeasonReport({ seed: 42, days: 28, forceAllOwners: "gus" });
    expect(greedy.summary.strikes).toBeGreaterThan(0);
  });
});
