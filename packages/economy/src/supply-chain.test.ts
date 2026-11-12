import { describe, expect, it } from "vitest";
import { TOTAL_COINS } from "@millbrook/shared";
import { SoloSession } from "./session.js";

/**
 * The full six-shop solo town exercises the inter-workshop supply chain: the
 * Tailor buys cloth from the Weaver to make clothes, and the Tavern buys bread
 * from the Bakery to make meals. The owners are ordered so the supply-chain
 * shops get able owners (the Weaver isn't Greedy Gus), so the Tailor is fed.
 * Coins only change hands, so the 10,000-coin total holds throughout.
 */
const FULL_TOWN = ["bakery", "smithy", "weaver", "tailor", "tavern", "brewery"] as const;

describe("inter-workshop supply chain (full six-shop town)", () => {
  it("the Tailor and Tavern both produce, with distinct owner names, total 10,000", () => {
    for (const seed of [42, 1, 7, 13, 21]) {
      const s = new SoloSession({ seed, days: 28, openWorkshops: [...FULL_TOWN] });
      const find = (t: string) => [...s.world.workshops.values()].find((x) => x.type === t)!;
      const tailor = find("tailor");
      const tavern = find("tavern");
      let tailorMade = false;
      let tavernMade = false;
      for (let i = 0; i < 28; i++) {
        s.step();
        s.world.ledger.assertInvariant(TOTAL_COINS);
        if (tailor.producedToday > 0) tailorMade = true;
        if (tavern.producedToday > 0) tavernMade = true;
      }
      expect(tailorMade).toBe(true);
      expect(tavernMade).toBe(true);

      // No two owners share a name even though the four AI strategies repeat.
      const names = [...s.world.owners.values()].map((o) => o.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
