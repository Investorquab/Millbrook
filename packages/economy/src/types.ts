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
  /** Age in years. Residents age one year per game week when ageing is on. */
  age: number;
  /** Retired from work (age ≥ 65): out of the labour force, living on savings. */
  retired: boolean;
  /**
   * A dependent child until this game day (0 for everyone born an adult). Before
   * it, the resident is out of the labour force but still a mouth to feed; on or
   * after it they start looking for work.
   */
  childUntilDay: number;
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
  /** Days spent bankrupt, counting up to the auction that re-lets the premises. */
  daysBankrupt: number;
  /** Premises are up for auction, awaiting a human's bid before an AI re-lets. */
  upForAuction: boolean;
  /** How many times the premises have been re-let at auction (for the name). */
  auctions: number;
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

export type Mayor = "none" | "thrifty" | "caring";

export interface TownHall {
  id: string;
  /** Fraction of each wage taken as tax at dusk. */
  wageTaxRate: number;
  /** Fraction of each sale taken as tax at night. */
  salesTaxRate: number;
  /** Daily unemployment benefit the Town Hall pays. */
  benefit: number;
  /** Wage floor every shop must meet (0 = none); a caring Mayor can set one. */
  minimumWage: number;
  /** Who the town last elected (sets the policy above). */
  mayor: Mayor;
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
  /**
   * Run the Game Master (M4): weather/metrics-driven events from the catalog,
   * within hard caps. Off by default so headless sims and determinism tests are
   * unaffected; the solo game turns it on.
   */
  gameMaster?: boolean;
  /**
   * Age the town (Phase-2 "living town"): residents age a year per game week,
   * retire at 65 to live on savings, and the very old pass away peacefully with
   * their savings passing to an heir (minus a 10% estate tax to the Town Hall).
   * Off by default so headless sims and determinism tests are unaffected; the
   * solo game and rooms turn it on. The 10,000-coin total always holds.
   */
  ageing?: boolean;
  /**
   * Auction bankrupt workshops: after a short cooldown the Town Hall re-lets the
   * premises to a new owner, who reopens the shop with a stake from the Town
   * Hall's treasury, so the town's trade keeps churning instead of shrinking.
   * Off by default (headless sims/determinism untouched); the solo game turns it
   * on. All coin moves conserve, so the 10,000-coin total holds.
   */
  auctions?: boolean;
  /**
   * Hold elections: at each phase boundary the residents elect a Mayor —
   * thrifty (lower taxes) or caring (more benefits and a minimum wage) — voting
   * by their own welfare. The winner sets the Town Hall's tax/benefit policy for
   * the phase. Off by default (headless/determinism untouched); the solo game
   * turns it on. Only rates move, never the 10,000-coin total.
   */
  elections?: boolean;
  /**
   * Petty theft: when unemployment runs high, goods start going missing from
   * the shops — goods are lost, never coins, so the 10,000-coin total is
   * untouched. Off by default (headless/determinism unaffected); the solo game
   * turns it on. A consequence of a town left to struggle, not a coin sink.
   */
  theft?: boolean;
}

/**
 * A weather reading the Game Master may act on. The OutLayer enclave supplies a
 * real one from the feed; the pure sim derives a deterministic one from the rng
 * so seasons stay reproducible. `source` records which, for the proof card.
 */
export interface WeatherReading {
  tempC: number;
  condition: "heat" | "storm" | "calm";
  source: "feed" | "metrics";
  /** Human-readable origin, e.g. "Open-Meteo, Lagos" or "derived from town metrics". */
  label: string;
}

/** An in-flight Game Master effect and its capped parameters. */
export interface ActiveGmEvent {
  id: string;
  title: string;
  effect: string;
  startDay: number;
  /** Game days of effect left; expires at 0. */
  remainingDays: number;
  params: {
    /** Multiplier on one raw good's price (drought, bumper, blight, shortage). */
    rawPriceMultiplier?: number;
    rawGood?: RawGood;
    /** Global multiplier on worker output (heatwave). */
    outputMultiplier?: number;
    /** Multiplier on discretionary demand (festival). */
    demandMultiplier?: number;
    /** A ceiling on the bread price residents pay (railway competition). */
    breadPriceCeiling?: number;
    /** Multiplier on one workshop type's output (new machine). */
    workshopOutputMultiplier?: number;
    workshopType?: WorkshopType;
  };
}

/** A fired Game Master event, kept for the feed and the "Why?" proof card. */
export interface FiredGmEvent {
  day: number;
  id: string;
  title: string;
  effect: string;
  /** One paragraph: the data read and why this event fired. */
  reason: string;
  /** The structured data the Game Master read (shown on the proof card). */
  data: Record<string, number | string>;
  /** "feed" when a real-world feed drove it, "metrics" on the fallback. */
  source: "feed" | "metrics";
}

/** The Game Master's runtime state on the world. */
export interface GameMasterRuntime {
  enabled: boolean;
  active: ActiveGmEvent[];
  /** Day the last event fired (−Infinity = none yet); enforces ≤1 per week. */
  lastEventDay: number;
  /** Whether the one-off Phase-3 shock has already fired. */
  phase3ShockDone: boolean;
  log: FiredGmEvent[];
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
  /** Game Master runtime (M4). Inert unless `config.gameMaster` is on. */
  gm: GameMasterRuntime;
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
  /** An AI owner has already retired this season (the once-a-season auction beat). */
  ownerRetired: boolean;
}
