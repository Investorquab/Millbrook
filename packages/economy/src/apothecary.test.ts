import { describe, expect, it } from "vitest";
import { TOTAL_COINS } from "@millbrook/shared";
import { SoloSession } from "./session.js";

/**
 * The seven-shop solo town adds the Apothecary on top of the full six. It buys
 * herbs from the Co-op (a raw good, no supply-chain dependency) and sells
 * remedies to residents — rarely on an ordinary day, far more often during an
 * epidemic. The owners are ordered so the Apothecary gets an able owner (Steady
 * Sam), not Greedy Gus, so it actually staffs up and produces. Coins only change
 * hands, so the 10,000-coin total holds throughout.
 */
const SEVEN_TOWN = [
  "bakery",
  "smithy",
  "weaver",
  "tailor",
  "tavern",
  "brewery",
  "apothecary",
] as const;

describe("the Apothecary (seven-shop town)", () => {
  it("produces and sells remedies, with distinct owner names, total 10,000", () => {
    for (const seed of [42, 1, 7, 13, 21]) {
      const s = new SoloSession({ seed, days: 28, openWorkshops: [...SEVEN_TOWN] });
      const apothecary = [...s.world.workshops.values()].find((x) => x.type === "apothecary")!;
      let made = 0;
      let sold = 0;
      for (let i = 0; i < 28; i++) {
        s.step();
        s.world.ledger.assertInvariant(TOTAL_COINS);
        made += apothecary.producedToday;
        sold += apothecary.soldToday;
      }
      expect(made).toBeGreaterThan(0);
      expect(sold).toBeGreaterThan(0);

      // No two owners share a name even though the four AI strategies repeat.
      const names = [...s.world.owners.values()].map((o) => o.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
