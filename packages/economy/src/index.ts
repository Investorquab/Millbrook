/**
 * @millbrook/economy — the pure, deterministic simulation engine. The server
 * and the web app import from here; nothing in this package reads the clock,
 * the network or disk, and all randomness flows through the seeded Rng.
 */

export * from "./types.js";
export { Rng } from "./rng.js";
export { Ledger } from "./ledger.js";
export { createWorld } from "./state.js";
export { stepDay, runSeason, pushFeed } from "./engine.js";
export * as rules from "./rules.js";
export { OWNER_STRATEGIES, strategyById } from "./owners/index.js";
export { GOAL_CARDS, standings, type GoalCard, type OwnerScore } from "./scoring.js";
export { runSeasonReport, formatReport, type SeasonReport } from "./sim.js";
export {
  SoloSession,
  createSoloSession,
  PRICE_MIN,
  PRICE_MAX,
  WAGE_MIN,
  WAGE_MAX,
  type SoloView,
  type WorkerView,
  type FeedLine,
  type Holdings,
  type ResidentCard,
  type ResidentNeed,
} from "./session.js";
