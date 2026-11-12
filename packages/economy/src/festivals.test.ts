import { describe, expect, it } from "vitest";
import { TOTAL_COINS } from "@millbrook/shared";
import { createWorld } from "./state.js";
import { stepDay } from "./engine.js";
import { festivalFactor, HARVEST_FESTIVAL_DAY, HARVEST_BOOST, MARKET_DAY_BOOST } from "./festivals.js";

function world(festivals: boolean) {
  return createWorld({ seed: 42, days: 28, festivals });
}

describe("holidays and festivals", () => {
  it("is off by default: every day is an ordinary day", () => {
    const w = world(false);
    w.day = HARVEST_FESTIVAL_DAY - 1; // today === HARVEST_FESTIVAL_DAY
    expect(festivalFactor(w)).toBe(1);
  });

  it("lifts spending on market days and the harvest festival", () => {
    const w = world(true);
    w.day = HARVEST_FESTIVAL_DAY - 1;
    expect(festivalFactor(w)).toBe(HARVEST_BOOST);
    w.day = 6; // today === 7, a market day
    expect(festivalFactor(w)).toBe(MARKET_DAY_BOOST);
    w.day = 3; // today === 4, an ordinary day
    expect(festivalFactor(w)).toBe(1);
  });

  it("announces festivals in the feed and keeps the 10,000 total across a season", () => {
    const w = world(true);
    for (let i = 0; i < 28; i++) {
      stepDay(w);
      w.ledger.assertInvariant(TOTAL_COINS);
    }
    const festivals = w.feed.filter((e) => e.kind === "festival");
    // Four market days (7,14,21,28) plus the harvest festival (25).
    expect(festivals.length).toBeGreaterThanOrEqual(4);
    expect(festivals.some((e) => /Harvest festival/.test(e.text))).toBe(true);
  });
});
