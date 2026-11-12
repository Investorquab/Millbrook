import { describe, expect, it } from "vitest";
import { TOTAL_COINS, TOWN_HALL_ID } from "@millbrook/shared";
import { createWorld } from "./state.js";
import { stepDay } from "./engine.js";
import { runHousing, RENT_PER_DAY } from "./housing.js";
import { aliveResidents } from "./rules.js";

function world(housing: boolean) {
  return createWorld({ seed: 42, days: 28, housing });
}

describe("rent and housing", () => {
  it("is off by default: no rent moves", () => {
    const w = world(false);
    const r = aliveResidents(w)[0]!;
    r.lastWage = 8;
    const before = w.ledger.get(r.id);
    runHousing(w);
    expect(w.ledger.get(r.id)).toBe(before);
  });

  it("collects rent from waged residents to the Town Hall, conserving the total", () => {
    const w = world(true);
    const waged = aliveResidents(w).filter((_, i) => i < 5);
    for (const r of waged) r.lastWage = 8;
    for (const r of aliveResidents(w).slice(5)) r.lastWage = 0;
    const hallBefore = w.ledger.get(TOWN_HALL_ID);
    runHousing(w);
    expect(w.ledger.get(TOWN_HALL_ID)).toBe(hallBefore + waged.length * RENT_PER_DAY);
    w.ledger.assertInvariant(TOTAL_COINS);
  });

  it("builds a house when the town outgrows its capacity", () => {
    const w = world(true);
    // Squeeze capacity so the town is over it, and make sure some are idle.
    w.houses = aliveResidents(w).length - 2;
    for (const r of aliveResidents(w)) r.employerId = null;
    const housesBefore = w.houses;
    runHousing(w);
    expect(w.houses).toBe(housesBefore + 1);
    expect(w.feed.some((e) => /built a new house/.test(e.text))).toBe(true);
    w.ledger.assertInvariant(TOTAL_COINS);
  });

  it("keeps the invariant and bounded population across full seasons", () => {
    for (const seed of [1, 7, 13, 21, 42]) {
      const s = createWorld({ seed, days: 28, housing: true });
      for (let i = 0; i < 28; i++) {
        stepDay(s);
        s.ledger.assertInvariant(TOTAL_COINS);
      }
      // Houses keep pace with the town (nobody is left permanently unhoused by much).
      expect(s.houses).toBeGreaterThanOrEqual(aliveResidents(s).length - 3);
    }
  });
});
