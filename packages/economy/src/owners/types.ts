/**
 * The interface every AI owner strategy implements. Each strategy lives in its
 * own file (gus, fern, sam, rita) so a reader can take in one owner's whole
 * personality at a glance. Every decision returns its reason for the tooltip.
 */

import type { AiStrategyId, Reasoned, Workshop, World } from "../types.js";
import type { WorkshopDef } from "../rules.js";

/** What an owner knows when it makes a decision at dawn. */
export interface OwnerContext {
  world: World;
  workshop: Workshop;
  def: WorkshopDef;
  townAvgWage: number;
  /** Yesterday's trade, so the owner can size the workforce. */
  demand: DemandSignal;
}

export interface DemandSignal {
  stock: number;
  soldYesterday: number;
  producedYesterday: number;
  /** Customers turned away yesterday for want of this good. */
  unmet: number;
  /** Unemployed residents available to hire. */
  applicants: number;
}

export interface OwnerStrategy {
  id: AiStrategyId;
  name: string;
  blurb: string;
  decideWage(ctx: OwnerContext): Reasoned<number>;
  decidePrice(ctx: OwnerContext): Reasoned<number>;
  /** Target headcount for today; the engine hires/fires toward it. */
  decideWorkforce(ctx: OwnerContext): Reasoned<number>;
  /** Will the owner buy a tool from the smithy when it can afford one? */
  buysTools: boolean;
}
