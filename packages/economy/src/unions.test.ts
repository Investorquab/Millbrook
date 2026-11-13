import { describe, expect, it } from "vitest";
import { TOTAL_COINS } from "@millbrook/shared";
import { createWorld } from "./state.js";
import { stepDay } from "./engine.js";
import { runUnions, formUnion, lowestPaidShop, UNION_FORM_DAYS } from "./unions.js";

function world(unions: boolean, seed = 42) {
  return createWorld({ seed, days: 28, unions });
}

/** Pay one shop clearly below the rest so it counts as "underpaid". */
function underpayOne(w: ReturnType<typeof world>) {
  const shops = [...w.workshops.values()];
  for (const s of shops) s.wage = 10;
  const low = shops[0]!;
  low.wage = 5; // < 0.8 × the ~9-coin average
  return low;
}

describe("unions", () => {
  it("is off by default: an underpaid shop never organises", () => {
    const w = world(false);
    const low = underpayOne(w);
    for (let i = 0; i < UNION_FORM_DAYS + 2; i++) runUnions(w);
    expect(low.unionised).toBe(false);
    expect(low.unionDays).toBe(0);
  });

  it("forms a union after a run of clearly-low wages", () => {
    const w = world(true);
    const low = underpayOne(w);
    for (let i = 0; i < UNION_FORM_DAYS - 1; i++) runUnions(w);
    expect(low.unionised).toBe(false); // not yet
    runUnions(w);
    expect(low.unionised).toBe(true);
    expect(w.feed.some((e) => e.kind === "gm_event")).toBe(true);
  });

  it("resets the streak when a shop pays up to the average", () => {
    const w = world(true);
    const low = underpayOne(w);
    runUnions(w);
    expect(low.unionDays).toBe(1);
    low.wage = 10; // now at the town average
    runUnions(w);
    expect(low.unionDays).toBe(0);
    expect(low.unionised).toBe(false);
  });

  it("a unionised shop that keeps underpaying is struck, moving no coins", () => {
    const w = world(true);
    const low = underpayOne(w);
    low.workers = [...w.residents.values()].slice(0, 2).map((r) => r.id);
    formUnion(w, low.id);
    const coinsBefore = w.ledger.total();

    runUnions(w);

    expect(low.strikeDays).toBeGreaterThan(0);
    expect(w.feed.some((e) => e.kind === "strike_start")).toBe(true);
    expect(w.ledger.total()).toBe(coinsBefore); // a strike stops work; it spends nothing
    w.ledger.assertInvariant(TOTAL_COINS);
  });

  it("lowestPaidShop picks the worst-paid staffed shop", () => {
    const w = world(true);
    const shops = [...w.workshops.values()];
    for (const s of shops) {
      s.wage = 10;
      s.workers = [[...w.residents.values()][0]!.id];
    }
    const target = shops[2]!;
    target.wage = 3;
    expect(lowestPaidShop(w)).toBe(target.id);
  });

  it("keeps the 10,000-coin invariant across full seasons with unions on", () => {
    for (let seed = 1; seed <= 8; seed++) {
      const w = world(true, seed);
      for (let i = 0; i < 28; i++) {
        stepDay(w);
        w.ledger.assertInvariant(TOTAL_COINS);
      }
    }
  });
});
