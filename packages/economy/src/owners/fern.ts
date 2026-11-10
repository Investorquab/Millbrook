/**
 * Fair Fern — pays above average, keeps prices steady, keeps loyal workers.
 * Her wages feed back into the town's spending, so her own shop and everyone
 * else's sells more.
 */

import type { OwnerStrategy } from "./types.js";
import { clampWage, clearingPrice, targetWorkforce } from "./shared.js";

export const fern: OwnerStrategy = {
  id: "fern",
  name: "Fair Fern",
  blurb: "Pays above average, steady prices, keeps loyal workers.",
  buysTools: true,

  decideWage(ctx) {
    const wage = clampWage(ctx.townAvgWage * 1.15);
    return { value: wage, reason: `Paying ${wage}, above the town average, to keep good workers.` };
  },

  decidePrice(ctx) {
    const price = clearingPrice(ctx, { min: 1.2, max: 3.0 });
    return { value: price, reason: `Pricing fairly at ${price}.` };
  },

  decideWorkforce(ctx) {
    // Slow to lay off (loyalty): only sheds when stock really piles up.
    const target = targetWorkforce(ctx, { oversupplyFactor: 1.5, hireEagerly: false });
    return { value: target, reason: `Keeping ${target} on, loyal to her crew.` };
  },
};
