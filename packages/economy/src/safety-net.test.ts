import { describe, it, expect } from "vitest";
import { runSeasonReport } from "./sim.js";

/**
 * Unemployment benefits and public works are automatic stabilisers: a town
 * that starts in a slump recovers, and does so faster and more fully with the
 * safety net than without it. Without them, a crash can spiral for the whole
 * season.
 */
describe("the safety net stabilises a crashed town", () => {
  const crash = { days: 28, startUnemployment: 0.4 } as const;

  it("brings unemployment under 20% within 10 days of a crash", () => {
    for (const seed of [1, 7, 13, 42]) {
      const withNet = runSeasonReport({ seed, ...crash, safetyNet: true });
      const firstTenDays = withNet.metrics.slice(0, 10);
      const recovered = firstTenDays.some((m) => m.unemployment < 0.2);
      expect(recovered).toBe(true);
    }
  });

  it("keeps average unemployment lower than with no safety net", () => {
    for (const seed of [1, 7, 42]) {
      const withNet = runSeasonReport({ seed, ...crash, safetyNet: true });
      const withoutNet = runSeasonReport({ seed, ...crash, safetyNet: false });
      expect(withNet.summary.avgUnemployment).toBeLessThan(withoutNet.summary.avgUnemployment);
    }
  });

  it("does not bankrupt the Town Hall into a negative balance", () => {
    const withNet = runSeasonReport({ seed: 7, ...crash, safetyNet: true });
    for (const m of withNet.metrics) {
      expect(m.townHallCoins).toBeGreaterThanOrEqual(0);
    }
  });
});
