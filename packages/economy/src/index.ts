/**
 * @millbrook/economy — the pure, deterministic simulation engine. The server
 * and the web app import from here; nothing in this package reads the clock,
 * the network or disk, and all randomness flows through the seeded Rng.
 */

export * from "./types.js";
export { Rng } from "./rng.js";
export { Ledger, type TransferRecord } from "./ledger.js";
export { createWorld } from "./state.js";
export { stepDay, runSeason, pushFeed } from "./engine.js";
export {
  runAgeing,
  AGE_WEEK_DAYS,
  RETIRE_AGE,
  DEATH_AGE,
  ESTATE_TAX_RATE,
} from "./ageing.js";
export {
  runAuctions,
  reletToAi,
  freshenPremises,
  AUCTION_COOLDOWN_DAYS,
  AUCTION_STAKE,
  AUCTION_BID_WINDOW_DAYS,
} from "./auction.js";
export {
  runElections,
  enforceMinimumWage,
  MAYOR_POLICY,
  ELECTION_DAYS,
  COMFORTABLE_SAVINGS,
} from "./elections.js";
export { runTheft, THEFT_UNEMPLOYMENT, THEFT_RATE } from "./theft.js";
export {
  runGameMaster,
  readGmMetrics,
  deriveWeather,
  activeGmEventIds,
  rawPriceFactor,
  outputFactor,
  workshopOutputFactor,
  demandFactor,
  breadPriceCeiling,
  type GmMetrics,
} from "./gamemaster.js";
export * as rules from "./rules.js";
export { OWNER_STRATEGIES, strategyById } from "./owners/index.js";
export { GOAL_CARDS, standings, type GoalCard, type OwnerScore } from "./scoring.js";
export { runSeasonReport, formatReport, type SeasonReport } from "./sim.js";
export {
  SoloSession,
  createSoloSession,
  reputationLabel,
  PRICE_MIN,
  PRICE_MAX,
  WAGE_MIN,
  WAGE_MAX,
  type SoloView,
  type WorkshopSlot,
  type AuctionOffer,
  type CoinHop,
  type CoinTrail,
  type ForemanOrders,
  type ForemanNote,
  type WorkerView,
  type FeedLine,
  type GmEventCard,
  type Holdings,
  type ResidentCard,
  type ResidentNeed,
  type MetricsSeries,
  type SeasonEvent,
  type GoalCardInfo,
  type StandingRow,
  type TrophyBadge,
  type SeasonSummary,
  type Gazette,
  type GazetteStory,
  type GazettePriceRow,
} from "./session.js";
