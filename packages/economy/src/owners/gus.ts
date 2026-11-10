/**
 * Greedy Gus — pays the minimum, undercuts on price, lays off fast. His low
 * wages shrink the town's spending power, which is the recession the game is
 * built to show.
 */

import type { OwnerStrategy } from "./types.js";
import { clampWage, clearingPrice, targetWorkforce } from "./shared.js";

export const gus: OwnerStrategy = {
  id: "gus",
  name: "Greedy Gus",
  blurb: "Pays the minimum, undercuts prices, lays off fast.",
  buysTools: false,

  decideWage(ctx) {
    // Pay well below the town average; the strike line is the only brake.
    const wage = clampWage(ctx.townAvgWage * 0.6);
    return { value: wage, reason: `Paying ${wage}, as little as the strike line allows.` };
  },

  decidePrice(ctx) {
    // Undercut: a thin markup and a low ceiling.
    const price = clearingPrice(ctx, { min: 1.05, max: 1.8 });
    return { value: price, reason: `Undercutting at ${price} to steal customers.` };
  },

  decideWorkforce(ctx) {
    const target = targetWorkforce(ctx, { oversupplyFactor: 0.6, hireEagerly: false });
    return { value: target, reason: `Keeping the payroll tight at ${target}.` };
  },
};
