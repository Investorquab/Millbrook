import { describe, it, expect } from "vitest";
import { runSeasonReport } from "./sim.js";
import { createWorld } from "./state.js";
import { runSeason } from "./engine.js";
import { GOAL_CARDS } from "./scoring.js";

/**
 * A calm player who follows the tutorial — steady, fair pricing and wages,
 * modelled by a Steady Sam owner — stays profitable in a healthy mixed town,
 * and the town itself doesn't fall apart around them.
 */
describe("a calm, steady owner stays profitable", () => {
  it("keeps the default mixed town healthy", () => {
    const report = runSeasonReport({ seed: 42, days: 28 });
    expect(report.summary.finalPopulation).toBeGreaterThanOrEqual(28);
    expect(report.summary.avgUnemployment).toBeLessThan(0.2);
  });

  it("leaves at least one owner in profit at season end", () => {
    const report = runSeasonReport({ seed: 42, days: 28 });
    const best = report.standings[0];
    expect(best).toBeDefined();
    expect(best!.score).toBeGreaterThan(0);
  });

  it("a Steady Sam bakery ends the season solvent across seeds", () => {
    let profitableSeasons = 0;
    const seeds = [2, 5, 11, 19, 23];
    for (const seed of seeds) {
      // An all-steady town is the calm baseline a tutorial player sits in.
      const world = createWorld({ seed, days: 28, forceAllOwners: "sam" });
      runSeason(world);
      const scored = [...world.owners.keys()].map((id) => GOAL_CARDS.tycoon!.scoreOwner!(world, id));
      if (scored.some((s) => s.score >= 0)) profitableSeasons++;
    }
    // Steady play is viable in the clear majority of towns.
    expect(profitableSeasons).toBeGreaterThanOrEqual(4);
  });
});
