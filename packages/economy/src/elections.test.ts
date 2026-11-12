import { describe, expect, it } from "vitest";
import { TOTAL_COINS, TOWN_HALL_ID } from "@millbrook/shared";
import { createWorld } from "./state.js";
import { stepDay } from "./engine.js";
import { WAGE_TAX_RATE } from "./rules.js";
import { runElections, enforceMinimumWage, MAYOR_POLICY, ELECTION_DAYS } from "./elections.js";

function world(elections: boolean, seed = 42) {
  return createWorld({ seed, days: 28, elections });
}

describe("elections and the minimum wage", () => {
  it("is off by default: policy stays at the baseline, no election is held", () => {
    const w = world(false);
    for (let i = 0; i < 28; i++) stepDay(w);
    expect(w.feed.some((e) => e.kind === "election")).toBe(false);
    expect(w.townHall.mayor).toBe("none");
    expect(w.townHall.minimumWage).toBe(0);
    expect(w.townHall.wageTaxRate).toBeCloseTo(WAGE_TAX_RATE, 9);
  });

  it("a comfortable town elects a thrifty Mayor (lower taxes)", () => {
    const w = world(true);
    // Fresh residents hold 100 coins each → comfortable → thrifty.
    w.day = ELECTION_DAYS[0]!;
    runElections(w);
    expect(w.townHall.mayor).toBe("thrifty");
    expect(w.townHall.wageTaxRate).toBe(MAYOR_POLICY.thrifty.wageTaxRate);
    expect(w.townHall.minimumWage).toBe(0);
    expect(w.feed.some((e) => e.kind === "election")).toBe(true);
  });

  it("a struggling town elects a caring Mayor with a minimum wage", () => {
    const w = world(true);
    // Make everyone jobless and poor → uncomfortable → caring.
    for (const r of w.residents.values()) {
      r.employerId = null;
      const bal = w.ledger.get(r.id);
      if (bal > 0) w.ledger.transfer(r.id, TOWN_HALL_ID, bal);
    }
    w.day = ELECTION_DAYS[0]!;
    runElections(w);
    expect(w.townHall.mayor).toBe("caring");
    expect(w.townHall.benefit).toBe(MAYOR_POLICY.caring.benefit);
    expect(w.townHall.minimumWage).toBe(MAYOR_POLICY.caring.minimumWage);

    // The minimum wage lifts a shop paying below it, touching no coins.
    const shop = [...w.workshops.values()][0]!;
    shop.wage = 4;
    const before = w.ledger.total();
    enforceMinimumWage(w);
    expect(shop.wage).toBe(MAYOR_POLICY.caring.minimumWage);
    expect(w.ledger.total()).toBe(before);
  });

  it("keeps the 10,000-coin total across full seasons with elections on", () => {
    for (const seed of [1, 2, 3, 7, 13, 21, 42]) {
      const w = world(true, seed);
      for (let i = 0; i < 28; i++) {
        stepDay(w);
        w.ledger.assertInvariant(TOTAL_COINS);
      }
      // Two elections were held (one per phase boundary).
      expect(w.feed.filter((e) => e.kind === "election").length).toBe(ELECTION_DAYS.length);
    }
  });
});
