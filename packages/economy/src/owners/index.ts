import type { AiStrategyId } from "../types.js";
import type { OwnerStrategy } from "./types.js";
import { gus } from "./gus.js";
import { fern } from "./fern.js";
import { sam } from "./sam.js";
import { rita } from "./rita.js";

export const OWNER_STRATEGIES: Record<AiStrategyId, OwnerStrategy> = { gus, fern, sam, rita };

export function strategyById(id: AiStrategyId): OwnerStrategy {
  return OWNER_STRATEGIES[id];
}

export type { OwnerStrategy, OwnerContext, DemandSignal } from "./types.js";
export { gus, fern, sam, rita };
