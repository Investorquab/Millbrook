import { describe, expect, it } from "vitest";
import { TOTAL_COINS } from "@millbrook/shared";
import { SoloSession } from "./session.js";

/**
 * The eight-shop solo town opens the Carpenter. It buys timber from the Co-op,
 * makes house parts, and the Town Hall buys those parts to raise new houses — so
 * the carpenter has real sales and the town can grow past its starting capacity.
 * Coins only change hands (resident→rent→Town Hall, Town Hall→carpenter), so the
 * 10,000-coin total holds.
 */
const EIGHT_TOWN = [
  "bakery",
  "smithy",
  "weaver",
  "tailor",
  "tavern",
  "brewery",
  "apothecary",
  "carpenter",
] as const;

describe("the Carpenter (eight-shop town)", () => {
  it("makes house parts the Town Hall buys, builds houses, total 10,000", () => {
    for (const seed of [42, 1, 7, 13]) {
      const s = new SoloSession({ seed, days: 28, openWorkshops: [...EIGHT_TOWN] });
      const carpenter = [...s.world.workshops.values()].find((x) => x.type === "carpenter")!;
      const housesStart = s.world.houses;
      let made = 0;
      let sold = 0;
      for (let i = 0; i < 28; i++) {
        s.step();
        s.world.ledger.assertInvariant(TOTAL_COINS);
        made += carpenter.producedToday;
        sold += carpenter.soldToday;
      }
      expect(made).toBeGreaterThan(0); // it produced parts
      expect(sold).toBeGreaterThan(0); // the Town Hall bought them
      expect(s.world.houses).toBeGreaterThan(housesStart); // and houses were raised
    }
  });
});
