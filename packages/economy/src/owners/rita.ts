/**
 * Risky Rita — expands fast, buys tools early, pays a touch above average to
 * poach workers, and prices just under the market to win share. Wins big or
 * goes broke.
 */

import type { OwnerStrategy } from "./types.js";
import { clampWage, clearingPrice, targetWorkforce } from "./shared.js";

export const rita: OwnerStrategy = {
  id: "rita",
  name: "Risky Rita",
  blurb: "Expands fast, buys machines early, wins big or goes broke.",
  buysTools: true,

  decideWage(ctx) {
    const wage = clampWage(ctx.townAvgWage * 1.05);
    return { value: wage, reason: `Paying ${wage} to poach workers for her expansion.` };
  },

  decidePrice(ctx) {
    const price = clearingPrice(ctx, { min: 1.0, max: 2.2 });
    return { value: price, reason: `Pricing low at ${price} to grab market share.` };
  },

  decideWorkforce(ctx) {
    // Hires eagerly whenever stock is thin.
    const target = targetWorkforce(ctx, { oversupplyFactor: 1.2, hireEagerly: true });
    return { value: target, reason: `Pushing headcount to ${target} to grow fast.` };
  },
};
