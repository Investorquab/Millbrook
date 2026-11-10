/**
 * Domain types for the Millbrook economy. State is plain data; all behaviour
 * lives in `rules.ts`, `owners/` and `engine.ts`. Nothing here imports the
 * engine, so types stay dependency-free.
 */

import type { FeedEvent, Good, RawGood, WorkshopType, Phase } from "@millbrook/shared";
import type { Rng } from "./rng.js";
import type { Ledger } from "./ledger.js";

export type Trait = "thrifty" | "loyal" | "ambitious";

/** A rule's output: the value plus one short sentence for the tooltip. */
export interface Reasoned<T> {
  value: T;
  reason: string;
}

export interface Resident {
  id: string;
  name: string;
  trait: Trait;
  /** Age in years. Residents age one year per game week (Phase-2 feature). */
  age: number;
  /** Workshop id or the Co-op id, or null when unemployed. */
  employerId: string | null;
  /** Coins earned at the most recent dusk. */
  lastWage: number;
  daysUnemployed: number;
  /** Game day the resident last bought cloth / clothes (−Infinity if never). */
  clothLastDay: number;
  clothesLastDay: number;
  /** Did the resident manage to buy their daily bread today? */
  ateToday: boolean;
  /** Consecutive days gone hungry — drives discontent and leaving. */
  hungryDays: number;
  alive: boolean;
  /** Short sentence explaining the resident's most recent choice. */
  lastReason: string;
}

export type OwnerKind = "ai" | "player";
export type AiStrategyId = "gus" | "fern" | "sam" | "rita";

export interface Owner {
  id: string;
  name: string;
  kind: OwnerKind;
  /** Set for AI owners; which strategy file drives them. */
  strategy: AiStrategyId | null;
  workshopId: string;
  /** Reputation from −100 (Ruthless) to +100 (Fair). */
  reputation: number;
}

export interface Workshop {
  id: string;
  type: WorkshopType;
  ownerId: string;
  open: boolean;
  /** Coins charged per unit of output. */
  price: number;
  /** Coins paid per worker per day. */
  wage: number;
  workers: string[];
  maxWorkers: number;
  outputStock: number;
  inputStock: Partial<Record<Good, number>>;
  /** Tools owned; each tool lifts one worker to the with-tools output rate. */
  tools: number;
  /** Consecutive days paying under 80% of the town average. */
  daysUnderpaid: number;
  /** Days of strike remaining (0 = working). */
  strikeDays: number;
  bankrupt: boolean;
  /** Days in a row the workshop could not pay full wages. */
  daysShortOnWages: number;
  /** Units sold / produced / coins taken today (reset each day). */
  soldToday: number;
  producedToday: number;
  revenueToday: number;
  /** Yesterday's figures, read by owners to size the workforce. */
  soldYesterday: number;
  producedYesterday: number;
  /** Coins the workshop started the season with, for profit scoring. */
  startingCoins: number;
}

export interface Coop {
  id: string;
  /** Current coin price of each raw good (GM events can move these). */
  rawPrices: Record<RawGood, number>;
  workers: string[];
  wage: number;
  /** Raw-material coins taken today / yesterday, to size the primary crew. */
  revenueToday: number;
  revenueYesterday: number;
}

export interface TownHall {
  id: string;
  /** Fraction of each wage taken as tax at dusk. */
  wageTaxRate: number;
  /** Fraction of each sale taken as tax at night. */
  salesTaxRate: number;
}

export interface DayMetrics {
  day: number;
  phase: Phase;
  population: number;
  employed: number;
  unemployment: number;
  avgWage: number;
  /** Coins residents spent on goods during the night step. */
  totalSales: number;
  ownersCoins: number;
  residentsCoins: number;
  coopCoins: number;
  townHallCoins: number;
}

export interface SeasonConfig {
  seed: number;
  days: number;
  /** Which of the 8 workshop types are open this town (4–6). */
  openWorkshops?: WorkshopType[];
  /**
   * Force every owner onto one AI strategy. Used by tests (all-greedy vs
   * all-fair) and left null for a normal mixed town.
   */
  forceAllOwners?: AiStrategyId | null;
  /** Start the season with this fraction of residents unemployed (0–1). */
  startUnemployment?: number;
  /** Turn the Town Hall safety net (benefits + public works) on/off. */
  safetyNet?: boolean;
}

export interface World {
  seed: number;
  day: number;
  phase: Phase;
  rng: Rng;
  ledger: Ledger;
  residents: Map<string, Resident>;
  workshops: Map<string, Workshop>;
  owners: Map<string, Owner>;
  coop: Coop;
  townHall: TownHall;
  openWorkshops: WorkshopType[];
  config: Required<Omit<SeasonConfig, "openWorkshops" | "forceAllOwners">> & {
    openWorkshops: WorkshopType[];
    forceAllOwners: AiStrategyId | null;
  };
  feed: FeedEvent[];
  metrics: DayMetrics[];
  /** Customers turned away for want of stock last night, per good. Feeds the
   *  owners' pricing: real unmet demand is what justifies a price rise. */
  unmetDemand: Partial<Record<Good, number>>;
  /** Tax the Town Hall took today / yesterday, so public works can be sized to
   *  what the treasury can sustain instead of draining it. */
  hallIncomeToday: number;
  hallIncomeYesterday: number;
  /** Monotonic counter for naming new arrivals. */
  nextResidentNumber: number;
}
