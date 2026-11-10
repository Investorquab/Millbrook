/**
 * Steady Sam — copies the town average on everything. A calm benchmark: he
 * neither starts a wage war nor ends one.
 */

import type { OwnerStrategy } from "./types.js";
import { clampWage, clearingPrice, targetWorkforce } from "./shared.js";

export const sam: OwnerStrategy = {
  id: "sam",
  name: "Steady Sam",
  blurb: "Copies the town average on everything.",
  buysTools: true,

  decideWage(ctx) {
    const wage = clampWage(ctx.townAvgWage);
    return { value: wage, reason: `Matching the town average at ${wage}.` };
  },

  decidePrice(ctx) {
    const price = clearingPrice(ctx, { min: 1.15, max: 2.6 });
    return { value: price, reason: `Pricing at the going rate, ${price}.` };
  },

  decideWorkforce(ctx) {
    const target = targetWorkforce(ctx, { oversupplyFactor: 1.0, hireEagerly: false });
    return { value: target, reason: `Running a steady ${target}.` };
  },
};
