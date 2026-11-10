/**
 * Shared helpers for the owner strategies: unit-cost pricing and a workforce
 * sizing rule the four personalities tune with two knobs.
 */

import { RAW_BASE_PRICES, WAGE_FLOOR } from "../rules.js";
import type { OwnerContext } from "./types.js";
import type { RawGood } from "@millbrook/shared";

/** Rough coins it costs to make one unit of output at the current wage. */
export function unitCost(ctx: OwnerContext): number {
  const { workshop, def } = ctx;
  const laborPerUnit = workshop.wage / def.perWorker;
  const rawPrice =
    def.input && def.input in RAW_BASE_PRICES ? RAW_BASE_PRICES[def.input as RawGood] : 1;
  const rawPerUnit = (def.input ? rawPrice : 0) * def.inputPerOutput;
  return laborPerUnit + rawPerUnit;
}

/**
 * A market-clearing price. Starts from the current price and nudges it up when
 * the good sold out (demand outran supply) or down on a glut, bounded by a cost
 * floor and the owner's markup appetite. This is what stops residents being
 * forced to hoard wages they can't spend: scarce goods get dearer until the
 * town's income recycles back to the owners.
 */
export function clearingPrice(
  ctx: OwnerContext,
  markup: { min: number; max: number },
): number {
  const { workshop, def, demand } = ctx;
  const cost = unitCost(ctx);
  const floor = Math.max(1, Math.ceil(cost * markup.min));
  const ceil = Math.max(floor, Math.ceil(cost * markup.max), def.defaultPrice);
  let price = workshop.price || def.defaultPrice;

  // Raise only on genuine unmet demand (customers turned away); cut when stock
  // is left on the shelf. Otherwise hold — this is what lets the price settle.
  if (demand.unmet > 0) price += 1;
  else if (demand.stock > def.perWorker * 0.5) price -= 1;

  return Math.max(floor, Math.min(ceil, price));
}

export interface WorkforceKnobs {
  /** Lower = lays off sooner when stock piles up. */
  oversupplyFactor: number;
  /** True = willing to add a worker on strong demand even with some stock. */
  hireEagerly: boolean;
}

/**
 * Size the workforce from yesterday's trade. Pile of unsold stock → shed a
 * worker; sold-out with strong demand → add one (up to the cap).
 */
export function targetWorkforce(ctx: OwnerContext, knobs: WorkforceKnobs): number {
  const { workshop, def, demand } = ctx;
  const cur = workshop.workers.length;
  const overSupplyThreshold = def.perWorker * knobs.oversupplyFactor;

  if (demand.stock > overSupplyThreshold) {
    return Math.max(0, cur - 1);
  }
  const strongDemand =
    demand.producedYesterday > 0 && demand.soldYesterday >= demand.producedYesterday * 0.9;
  const nearlyOut = demand.stock < def.perWorker * 0.5;
  // Unmet demand (customers turned away) is the signal that restarts a workshop
  // that has shed to zero — without it, a shop with no output makes no sales,
  // sees no "strong demand", and could never hire its way back.
  const turnedAwayCustomers = demand.unmet > 0;
  if (turnedAwayCustomers || (strongDemand && nearlyOut) || (knobs.hireEagerly && nearlyOut)) {
    if (cur < workshop.maxWorkers && demand.applicants > 0) return cur + 1;
  }
  return cur;
}

export function clampWage(wage: number): number {
  return Math.max(WAGE_FLOOR, Math.round(wage));
}
