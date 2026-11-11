/**
 * SoloSession — a thin, deterministic driver that lets a human run one workshop
 * (the bakery) against the AI owners. It wraps a {@link World}: the player's
 * workshop owner has `strategy === null`, so the engine leaves its price, wage
 * and headcount alone at dawn (see `engine.ts`), and the player sets them here.
 *
 * This is pure like the rest of the package — no clock, no I/O, all randomness
 * through the world's seeded Rng — so the same seed and the same sequence of
 * actions always produce the same season. The web app and the server both drive
 * the solo game through this class.
 */

import {
  COOP_ID,
  TOTAL_COINS,
  TOWN_HALL_ID,
  type FeedEventKind,
  type Good,
  type Phase,
  type RawGood,
  type WorkshopType,
} from "@millbrook/shared";
import { createWorld } from "./state.js";
import { pushFeed, stepDay } from "./engine.js";
import {
  TOWN_HALL_PUBLIC_WORKS_EMPLOYER,
  WORKSHOP_DEFS,
  aliveResidents,
  townAverageWage,
  unemploymentRate,
} from "./rules.js";
import { GOAL_CARDS } from "./scoring.js";
import type { AiStrategyId, SeasonConfig, Trait, Workshop, World } from "./types.js";

/** Player stepper bounds — the single source of truth the HUD imports too. */
export const PRICE_MIN = 1;
export const PRICE_MAX = 6;
export const WAGE_MIN = 5;
export const WAGE_MAX = 12;

const DEFAULT_PRICE = 3;
const DEFAULT_WAGE = 8;
const FEED_LINES = 8;

export interface WorkerView {
  id: string;
  name: string;
}

export interface FeedLine {
  day: number;
  kind: string;
  text: string;
}

/** A Game Master event for the "Why did this happen?" card: what fired, the
 *  data it read, the reasoning, the feed source, and whether it's still active. */
export interface GmEventCard {
  day: number;
  id: string;
  title: string;
  effect: string;
  reason: string;
  data: Record<string, number | string>;
  source: "feed" | "metrics";
  active: boolean;
}

/** The town's coins, split by who holds them. Always sums to 10,000. */
export interface Holdings {
  residents: number;
  workshops: number;
  coop: number;
  townHall: number;
  total: number;
}

export interface ResidentNeed {
  label: string;
  status: "done" | "pending" | "later";
}

export interface ResidentCard {
  id: string;
  name: string;
  trait: Trait;
  traitLabel: string;
  age: number;
  /** "Baker at your bakery", "Weaver at Fair Fern's weaver", "Looking for work"… */
  employerLabel: string;
  worksForPlayer: boolean;
  wage: number;
  savings: number;
  daysUnemployed: number;
  mood: string;
  needs: ResidentNeed[];
  /** The resident's most recent choice, in their own words (from the rules). */
  currentReason: string;
  /** Timestamped events about this resident, newest first (from the feed). */
  history: { day: number; text: string }[];
}

const TRAIT_LABEL: Record<Trait, string> = {
  thrifty: "Thrifty",
  loyal: "Loyal to fair bosses",
  ambitious: "Ambitious",
};

const ROLE_BY_TYPE: Record<WorkshopType, string> = {
  bakery: "Baker",
  weaver: "Weaver",
  smithy: "Smith",
  brewery: "Brewer",
  tailor: "Tailor",
  tavern: "Taverner",
  carpenter: "Carpenter",
  apothecary: "Apothecary",
};

export interface SoloView {
  /** 1-indexed current game day, capped at the season length. */
  day: number;
  totalDays: number;
  phase: Phase;
  phaseLabel: string;
  /** Season is over; no more days can be stepped. */
  ended: boolean;

  /** The player's bakery coins, and the change over the last day. */
  coins: number;
  coinsDelta: number;

  unemploymentPct: number;
  unemploymentRising: boolean;
  mood: string;
  avgWage: number;

  workshopType: WorkshopType;
  price: number;
  wage: number;
  priceReason: string;
  wageReason: string;
  /** This shop's owner standing, −100 (Ruthless) … +100 (Fair), and a label. */
  reputation: number;
  reputationLabel: string;
  stock: number;
  soldToday: number;
  profitToday: number;
  workers: WorkerView[];
  maxWorkers: number;
  canHire: boolean;
  onStrike: boolean;
  bankrupt: boolean;

  feed: FeedLine[];
}

/** One game day's values for the fast-forward charts. Percentages are 0–100. */
export interface MetricsSeries {
  /** 1-indexed day numbers, one per recorded day. */
  days: number[];
  minDay: number;
  maxDay: number;
  unemployment: number[];
  avgWage: number[];
  /** Share of the fixed 10,000 coins residents hold, as a percentage. */
  residentShare: number[];
}

/** A notable thing that happened, for the "what happened" list and markers. */
export interface SeasonEvent {
  /** 1-indexed day. */
  day: number;
  kind: FeedEventKind;
  text: string;
}

export interface GoalCardInfo {
  id: string;
  name: string;
  howToWin: string;
}

/** One row of the season-end standings. */
export interface StandingRow {
  ownerId: string;
  name: string;
  /** Portrait key ("gus"/"fern"/"sam"/"rita"), or null for the player. */
  faceKey: AiStrategyId | null;
  workshopType: WorkshopType;
  isPlayer: boolean;
  profit: number;
  workers: number;
  wage: number;
  reputation: number;
  /** Score under the active goal card (higher is better). */
  score: number;
  detail: string;
  rank: number;
}

export interface SeasonSummary {
  day: number;
  totalDays: number;
  goal: GoalCardInfo;
  playerRank: number;
  ownerCount: number;
  /** "You finished second", etc. */
  headline: string;
  blurb: string;
  unemploymentPct: number;
  residents: number;
  coins: number;
  /** Comings-and-goings prose, from real migration/bankruptcy events. */
  townNote: string;
  trophy: { name: string; note: string } | null;
}

export interface GazettePriceRow {
  good: string;
  lastWeek: number | null;
  now: number;
}

export interface GazetteStory {
  heading: string;
  paragraphs: string[];
}

export interface Gazette {
  week: number;
  day: number;
  /** "Week 2, printed at dawn on day 14" */
  dateline: string;
  lead: GazetteStory;
  secondary: GazetteStory | null;
  prices: GazettePriceRow[];
  comingsAndGoings: string[];
  notice: string;
}

/** A daily snapshot of the four finished-good prices + wheat, for the Gazette. */
interface PriceSnapshot {
  day: number;
  bread: number;
  cloth: number;
  tool: number;
  ale: number;
  wheat: number;
}

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth"];

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/** A short word for a reputation score, for the HUD and cards. */
export function reputationLabel(rep: number): string {
  if (rep >= 40) return "Fair";
  if (rep >= 10) return "Well liked";
  if (rep > -10) return "Neutral";
  if (rep > -40) return "Harsh";
  return "Ruthless";
}

function phaseLabel(phase: Phase): string {
  switch (phase) {
    case "settling":
      return "Settling";
    case "competition":
      return "Competition";
    case "industrial":
      return "Industrial";
  }
}

/** One claimable shop in a room: its type, id and whether a player runs it. */
export interface WorkshopSlot {
  type: WorkshopType;
  workshopId: string;
  /** True once a human has claimed it (owner strategy null → engine leaves it alone). */
  claimed: boolean;
}

export class SoloSession {
  readonly world: World;
  readonly playerWorkshopId: string;
  private readonly totalDays: number;
  private prevCoins: number;
  private prevUnemployment: number;
  private coinsDelta = 0;
  private profitToday = 0;
  private unemploymentRising = false;
  private goalCardId = "tycoon";
  private readonly priceHistory: PriceSnapshot[] = [];
  /** Workshop ids a human controls (the bakery from the start; more via claim()). */
  private readonly claimed = new Set<string>();
  /** AI strategy saved when a shop was claimed, to restore it on release. */
  private readonly savedStrategy = new Map<string, AiStrategyId>();
  /** Per-claimed-workshop coins at the last dawn, for each player's day delta. */
  private readonly prevCoinsByWs = new Map<string, number>();
  private readonly deltaByWs = new Map<string, number>();

  constructor(config: SeasonConfig) {
    // A predictable solo town: the four Phase-1 workshops in a fixed order so
    // the player always runs the bakery, with the AI owners on the rest.
    this.world = createWorld({
      openWorkshops: ["bakery", "weaver", "smithy", "brewery"],
      // The solo game runs the Game Master (M4) by default; a caller can pass
      // gameMaster: false to turn it off.
      gameMaster: true,
      ...config,
    });
    this.totalDays = this.world.config.days;

    // The first workshop (bakery) becomes the player's.
    const bakery = [...this.world.workshops.values()].find((w) => w.type === "bakery");
    if (!bakery) throw new Error("solo season has no bakery to run");
    this.playerWorkshopId = bakery.id;
    const owner = this.world.owners.get(bakery.ownerId);
    if (owner) {
      owner.kind = "player";
      owner.strategy = null;
      owner.name = "You";
    }
    bakery.price = DEFAULT_PRICE;
    bakery.wage = DEFAULT_WAGE;

    this.claimed.add(this.playerWorkshopId);
    this.prevCoins = this.world.ledger.get(this.playerWorkshopId);
    this.prevCoinsByWs.set(this.playerWorkshopId, this.prevCoins);
    this.prevUnemployment = unemploymentRate(this.world);
    this.snapshotPrices();
  }

  private get workshop(): Workshop {
    return this.world.workshops.get(this.playerWorkshopId)!;
  }

  /** Resolve a workshop by id, defaulting to the primary (bakery) workshop. */
  private resolveWorkshop(workshopId?: string): Workshop {
    if (!workshopId) return this.workshop;
    const w = this.world.workshops.get(workshopId);
    if (!w) throw new Error(`no workshop ${workshopId}`);
    return w;
  }

  // ── Claiming (multiplayer: each player runs one shop) ───────────────────────

  /** The four open shops and whether a human already runs each — for the lobby. */
  workshopSlots(): WorkshopSlot[] {
    return [...this.world.workshops.values()]
      .filter((w) => w.open)
      .map((w) => ({ type: w.type, workshopId: w.id, claimed: this.claimed.has(w.id) }));
  }

  isClaimed(workshopId: string): boolean {
    return this.claimed.has(workshopId);
  }

  /**
   * Hand a shop to a human: its AI owner becomes player-controlled (strategy
   * null → the engine stops setting its price/wage/headcount at dawn, the player
   * does). Returns the workshop id, or null if the type isn't open or is already
   * claimed. The caller tracks which player owns which shop.
   */
  claim(type: WorkshopType): string | null {
    const w = this.workshopOfType(type);
    if (!w || this.claimed.has(w.id)) return null;
    const owner = this.world.owners.get(w.ownerId);
    if (owner) {
      if (owner.strategy) this.savedStrategy.set(w.id, owner.strategy);
      owner.kind = "player";
      owner.strategy = null;
    }
    // Inherit the shop as-is, but clamp into the stepper bounds so the UI is valid.
    w.price = clamp(w.price, PRICE_MIN, PRICE_MAX);
    w.wage = clamp(w.wage, WAGE_MIN, WAGE_MAX);
    this.claimed.add(w.id);
    this.prevCoinsByWs.set(w.id, this.world.ledger.get(w.id));
    return w.id;
  }

  /** What one shop can put up for trade: its own output good. */
  tradeGood(workshopId: string): Good | null {
    const w = this.world.workshops.get(workshopId);
    return w ? WORKSHOP_DEFS[w.type].output : null;
  }

  /**
   * Execute a trade between two shops: the buyer pays `coins` to the seller, and
   * the seller hands over `qty` units of its output good. Tools lift the buyer's
   * output (each tool raises one worker to the with-tools rate); other goods are
   * simply bought off the market. Only coins move on the ledger, so the town's
   * 10,000 total is conserved. Returns whether it went through and why.
   */
  trade(sellerWorkshopId: string, buyerWorkshopId: string, qty: number, coins: number): { ok: boolean; reason: string } {
    const seller = this.world.workshops.get(sellerWorkshopId);
    const buyer = this.world.workshops.get(buyerWorkshopId);
    if (!seller || !buyer || seller.id === buyer.id) return { ok: false, reason: "That trade needs two different shops." };
    if (!Number.isInteger(qty) || qty <= 0 || !Number.isInteger(coins) || coins < 0) {
      return { ok: false, reason: "A trade needs a whole quantity and price." };
    }
    if (seller.bankrupt || buyer.bankrupt) return { ok: false, reason: "A bankrupt shop can't trade." };
    if (Math.floor(seller.outputStock) < qty) {
      return { ok: false, reason: `The seller only has ${Math.floor(seller.outputStock)} to give.` };
    }
    if (this.world.ledger.get(buyer.id) < coins) {
      return { ok: false, reason: "The buyer can't cover that price." };
    }
    const good = WORKSHOP_DEFS[seller.type].output;
    // Coins: buyer → seller (conserves the total).
    if (coins > 0) this.world.ledger.payUpTo(buyer.id, seller.id, coins);
    // Goods: out of the seller, into the buyer.
    seller.outputStock -= qty;
    seller.soldToday += qty;
    seller.revenueToday += coins;
    if (good === "tool") buyer.tools += qty;
    pushFeed(
      this.world,
      "trade",
      `${this.shopLabel(seller)} sold ${qty} ${good} to ${this.shopLabel(buyer)} for ${coins} coins.`,
      { workshop: buyer.id, from: seller.id, good, qty, coins },
    );
    this.world.ledger.assertInvariant(TOTAL_COINS);
    return { ok: true, reason: `Traded ${qty} ${good} for ${coins} coins.` };
  }

  private shopLabel(w: Workshop): string {
    const owner = this.world.owners.get(w.ownerId);
    return owner && owner.kind === "player" ? `the ${w.type}` : `${owner?.name ?? "a rival"}'s ${w.type}`;
  }

  /** Hand a claimed shop back to the AI (restoring its strategy), e.g. on leave. */
  release(workshopId: string): void {
    if (workshopId === this.playerWorkshopId || !this.claimed.has(workshopId)) return;
    const w = this.world.workshops.get(workshopId);
    const owner = w && this.world.owners.get(w.ownerId);
    if (owner) {
      owner.strategy = this.savedStrategy.get(workshopId) ?? owner.strategy;
      owner.kind = "ai";
    }
    this.claimed.delete(workshopId);
    this.savedStrategy.delete(workshopId);
  }

  /** The AI/player workshop of a given type, if this town opened it. */
  private workshopOfType(type: WorkshopType): Workshop | undefined {
    return [...this.world.workshops.values()].find((w) => w.type === type);
  }

  /** Record the day's headline prices so the Gazette can show week-on-week change. */
  private snapshotPrices(): void {
    const priceOf = (type: WorkshopType, fallback: number): number =>
      this.workshopOfType(type)?.price ?? fallback;
    this.priceHistory.push({
      day: this.world.day,
      bread: priceOf("bakery", WORKSHOP_DEFS.bakery.defaultPrice),
      cloth: priceOf("weaver", WORKSHOP_DEFS.weaver.defaultPrice),
      tool: priceOf("smithy", WORKSHOP_DEFS.smithy.defaultPrice),
      ale: priceOf("brewery", WORKSHOP_DEFS.brewery.defaultPrice),
      wheat: this.world.coop.rawPrices.wheat ?? 0,
    });
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  setPrice(price: number, workshopId?: string): void {
    this.resolveWorkshop(workshopId).price = clamp(price, PRICE_MIN, PRICE_MAX);
  }

  setWage(wage: number, workshopId?: string): void {
    this.resolveWorkshop(workshopId).wage = clamp(wage, WAGE_MIN, WAGE_MAX);
  }

  /** Hire one idle resident into a player shop. Returns false if it couldn't. */
  hire(workshopId?: string): boolean {
    const w = this.resolveWorkshop(workshopId);
    if (w.bankrupt || w.workers.length >= w.maxWorkers) return false;
    const idle = aliveResidents(this.world).find((r) => r.employerId === null);
    if (!idle) return false;
    // The bakery (the solo/host shop) keeps its familiar "your bakery" wording.
    const shop = w.id === this.playerWorkshopId ? "your bakery" : `your ${w.type}`;
    idle.employerId = w.id;
    idle.daysUnemployed = 0;
    idle.lastReason = `Hired at ${shop} for ${w.wage} a day.`;
    w.workers.push(idle.id);
    pushFeed(this.world, "hire", `You hired ${idle.name} at ${shop} for ${w.wage} a day.`, {
      resident: idle.id,
      workshop: w.id,
    });
    return true;
  }

  /** Advance one game day. No-op once the season has ended. */
  step(): void {
    if (this.world.day >= this.totalDays) return;
    const before = new Map<string, number>();
    for (const id of this.claimed) before.set(id, this.world.ledger.get(id));
    const beforeCoins = this.world.ledger.get(this.playerWorkshopId);
    const beforeUnemp = unemploymentRate(this.world);
    stepDay(this.world);
    for (const id of this.claimed) {
      this.deltaByWs.set(id, this.world.ledger.get(id) - (before.get(id) ?? 0));
      this.prevCoinsByWs.set(id, this.world.ledger.get(id));
    }
    const afterCoins = this.world.ledger.get(this.playerWorkshopId);
    this.coinsDelta = afterCoins - beforeCoins;
    this.profitToday = afterCoins - beforeCoins;
    this.prevCoins = afterCoins;
    this.unemploymentRising = unemploymentRate(this.world) > beforeUnemp + 1e-9;
    this.prevUnemployment = beforeUnemp;
    this.snapshotPrices();
  }

  // ── Reasons (real data, short sentences for the tooltip) ────────────────────

  private priceReason(w: Workshop = this.workshop): string {
    const def = WORKSHOP_DEFS[w.type];
    const wheat = this.world.coop.rawPrices[def.input as RawGood] ?? 0;
    const cost = def.inputPerOutput * wheat;
    if (w.price <= cost) return `Below your wheat cost of ${cost.toFixed(1)} — you lose on every loaf.`;
    const avgWage = townAverageWage(this.world);
    if (w.price <= avgWage * 0.4) return "Cheap — most residents can easily afford it.";
    if (w.price <= avgWage * 0.6) return "A fair price most residents can afford.";
    return "Steep — only the well-paid will buy at this price.";
  }

  private wageReason(w: Workshop = this.workshop): string {
    const avg = townAverageWage(this.world);
    const avgLabel = avg.toFixed(1);
    if (w.wage < avg * 0.8) return `Below the town average of ${avgLabel}. Your workers may strike.`;
    if (w.wage <= avg + 0.5) return `Around the town average of ${avgLabel}.`;
    return `Above the ${avgLabel} average. Better applicants, thinner margins.`;
  }

  private mood(): string {
    const u = unemploymentRate(this.world);
    const hungry = aliveResidents(this.world).filter((r) => r.hungryDays > 0).length;
    if (u >= 0.2 || hungry >= 6) return "Strained";
    if (u >= 0.1 || hungry >= 2) return "Uneasy";
    return "Content";
  }

  // ── View ────────────────────────────────────────────────────────────────────

  view(workshopId?: string): SoloView {
    const w = this.resolveWorkshop(workshopId);
    const isPrimary = w.id === this.playerWorkshopId;
    const coinsDelta = isPrimary ? this.coinsDelta : (this.deltaByWs.get(w.id) ?? 0);
    const workers: WorkerView[] = w.workers
      .map((id) => this.world.residents.get(id))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => ({ id: r.id, name: r.name }));

    const feed: FeedLine[] = this.world.feed
      .slice(-FEED_LINES)
      .reverse()
      .map((e) => ({ day: e.day + 1, kind: e.kind, text: e.text }));

    return {
      day: Math.min(this.world.day + 1, this.totalDays),
      totalDays: this.totalDays,
      phase: this.world.phase,
      phaseLabel: phaseLabel(this.world.phase),
      ended: this.world.day >= this.totalDays,

      coins: this.world.ledger.get(w.id),
      coinsDelta,

      unemploymentPct: Math.round(unemploymentRate(this.world) * 100),
      unemploymentRising: this.unemploymentRising,
      mood: this.mood(),
      avgWage: townAverageWage(this.world),

      workshopType: w.type,
      price: w.price,
      wage: w.wage,
      priceReason: this.priceReason(w),
      wageReason: this.wageReason(w),
      reputation: Math.round(this.world.owners.get(w.ownerId)?.reputation ?? 0),
      reputationLabel: reputationLabel(this.world.owners.get(w.ownerId)?.reputation ?? 0),
      stock: Math.floor(w.outputStock),
      soldToday: Math.floor(w.soldToday),
      profitToday: isPrimary ? this.profitToday : (this.deltaByWs.get(w.id) ?? 0),
      workers,
      maxWorkers: w.maxWorkers,
      canHire: !w.bankrupt && w.workers.length < w.maxWorkers,
      onStrike: w.strikeDays > 0,
      bankrupt: w.bankrupt,

      feed,
    };
  }

  // ── Proof: the town's coins, split by holder (always sums to 10,000) ────────

  holdings(): Holdings {
    const ledger = this.world.ledger;
    let residents = 0;
    for (const r of this.world.residents.values()) if (r.alive) residents += ledger.get(r.id);
    // Departed residents' coins went to the Town Hall, but their ledger rows may
    // linger; count every non-alive resident's balance with the Town Hall so the
    // split still totals the full supply.
    let strays = 0;
    for (const r of this.world.residents.values()) if (!r.alive) strays += ledger.get(r.id);
    let workshops = 0;
    for (const w of this.world.workshops.values()) workshops += ledger.get(w.id);
    const coop = ledger.get(COOP_ID);
    const townHall = ledger.get(TOWN_HALL_ID) + strays;
    const total = residents + workshops + coop + townHall;
    return { residents, workshops, coop, townHall, total };
  }

  // ── Resident card ───────────────────────────────────────────────────────────

  /** Ids of living residents, for a picker. */
  residentIds(): string[] {
    return aliveResidents(this.world).map((r) => r.id);
  }

  /** A default resident to show: the first baker at the player's shop, else
   *  the first resident in town. */
  private defaultResidentId(): string {
    const first = this.workshop.workers[0];
    if (first) return first;
    const anyone = aliveResidents(this.world)[0];
    return anyone ? anyone.id : "";
  }

  private employerLabel(employerId: string | null): { label: string; worksForPlayer: boolean } {
    if (employerId === null) return { label: "Looking for work", worksForPlayer: false };
    if (employerId === TOWN_HALL_PUBLIC_WORKS_EMPLOYER)
      return { label: "On the town's public works", worksForPlayer: false };
    if (employerId === COOP_ID) return { label: "Works the land for the Town Co-op", worksForPlayer: false };
    const w = this.world.workshops.get(employerId);
    if (!w) return { label: "Working in town", worksForPlayer: false };
    const role = ROLE_BY_TYPE[w.type];
    if (w.id === this.playerWorkshopId) return { label: `${role} at your bakery`, worksForPlayer: true };
    const owner = this.world.owners.get(w.ownerId);
    return { label: `${role} at ${owner?.name ?? "a rival"}'s ${w.type}`, worksForPlayer: false };
  }

  residentCard(id?: string): ResidentCard | null {
    const rid = id ?? this.defaultResidentId();
    const r = this.world.residents.get(rid);
    if (!r) return null;
    const { label, worksForPlayer } = this.employerLabel(r.employerId);
    const savings = this.world.ledger.get(r.id);

    const mood = r.hungryDays >= 3 ? "Struggling" : r.hungryDays >= 1 ? "Hungry" : savings < 20 ? "Getting by" : "Content";

    const needs: ResidentNeed[] = [
      r.ateToday
        ? { label: "Bread today — bought it", status: "done" }
        : { label: "Bread today — not yet", status: "pending" },
      this.world.day - r.clothLastDay >= 7
        ? { label: "Cloth this week — saving up for it", status: "pending" }
        : { label: "Cloth this week — already has some", status: "done" },
      { label: "Clothes once the tailor opens", status: "later" },
    ];

    const history = this.world.feed
      .filter((e) => e.data?.resident === r.id)
      .slice(-4)
      .reverse()
      .map((e) => ({ day: e.day + 1, text: e.text }));

    return {
      id: r.id,
      name: r.name,
      trait: r.trait,
      traitLabel: TRAIT_LABEL[r.trait],
      age: r.age,
      employerLabel: label,
      worksForPlayer,
      wage: r.lastWage,
      savings,
      daysUnemployed: r.daysUnemployed,
      mood,
      needs,
      currentReason: r.lastReason,
      history,
    };
  }

  // ── Goal card ────────────────────────────────────────────────────────────────

  /** The active goal card the season is scored against. */
  goalCard(): GoalCardInfo {
    const card = GOAL_CARDS[this.goalCardId] ?? GOAL_CARDS.tycoon!;
    return { id: card.id, name: card.name, howToWin: card.howToWin };
  }

  /** Choose which goal card the season is scored against (defaults to Tycoon). */
  setGoalCard(id: string): void {
    if (GOAL_CARDS[id]) this.goalCardId = id;
  }

  // ── Fast-forward: charts and the "what happened" list ───────────────────────

  /** Day-by-day series for the fast-forward dashboard charts. */
  metricsSeries(): MetricsSeries {
    const ms = this.world.metrics;
    const days = ms.map((m) => m.day + 1);
    return {
      days,
      minDay: days[0] ?? 1,
      maxDay: days.at(-1) ?? this.totalDays,
      unemployment: ms.map((m) => Math.round(m.unemployment * 1000) / 10),
      avgWage: ms.map((m) => Math.round(m.avgWage * 100) / 100),
      residentShare: ms.map((m) => Math.round((m.residentsCoins / TOTAL_COINS) * 1000) / 10),
    };
  }

  /**
   * The most notable events of the season, newest-weighted by importance, for
   * the "what happened" list and the numbered chart markers. At most `limit`.
   */
  seasonEvents(limit = 3): SeasonEvent[] {
    const WEIGHT: Partial<Record<FeedEventKind, number>> = {
      strike_start: 6,
      bankruptcy: 6,
      public_works: 5,
      benefit_paid: 5,
      phase_change: 4,
      wage_change: 3,
      migration_in: 2,
      migration_out: 2,
      strike_end: 2,
    };
    return this.world.feed
      .filter((e) => WEIGHT[e.kind] !== undefined)
      .map((e) => ({ event: e, weight: WEIGHT[e.kind]! }))
      .sort((a, b) => b.weight - a.weight || a.event.day - b.event.day)
      .slice(0, limit)
      .sort((a, b) => a.event.day - b.event.day)
      .map(({ event }) => ({ day: event.day + 1, kind: event.kind, text: event.text }));
  }

  /**
   * Game Master events this season, newest first, for the "Why did this happen?"
   * card: the event, the data it read, its reasoning, the feed source, and
   * whether it is still in effect.
   */
  gmEvents(limit = 6): GmEventCard[] {
    const activeIds = new Set(this.world.gm.active.map((e) => e.id));
    return [...this.world.gm.log]
      .reverse()
      .slice(0, limit)
      .map((f) => ({
        day: f.day + 1,
        id: f.id,
        title: f.title,
        effect: f.effect,
        reason: f.reason,
        data: f.data,
        source: f.source,
        active: activeIds.has(f.id),
      }));
  }

  // ── Season end: standings and summary ────────────────────────────────────────

  private row(ownerId: string): StandingRow {
    const owner = this.world.owners.get(ownerId)!;
    const w = this.world.workshops.get(owner.workshopId)!;
    const card = GOAL_CARDS[this.goalCardId] ?? GOAL_CARDS.tycoon!;
    const scored = card.scoreOwner
      ? card.scoreOwner(this.world, ownerId)
      : { score: 0, detail: "" };
    return {
      ownerId,
      name: owner.name,
      faceKey: owner.strategy,
      workshopType: w.type,
      isPlayer: w.id === this.playerWorkshopId,
      profit: this.world.ledger.get(w.id) - w.startingCoins,
      workers: w.workers.length,
      wage: w.wage,
      reputation: Math.round(owner.reputation),
      score: scored.score,
      detail: scored.detail,
      rank: 0,
    };
  }

  /** Final standings, best first, ranked by the active goal card. */
  standings(): StandingRow[] {
    const rows = [...this.world.owners.keys()].map((id) => this.row(id));
    rows.sort((a, b) => b.score - a.score || b.profit - a.profit);
    rows.forEach((r, i) => (r.rank = i + 1));
    return rows;
  }

  private trophy(rank: number): { name: string; note: string } | null {
    const note = "Earned this season — it attaches to your NEAR profile once on-chain accounts land (M3).";
    if (rank === 1) {
      const byCard: Record<string, string> = {
        tycoon: "Town Tycoon",
        biggest_employer: "Town Benefactor",
        fair_boss: "Fair Boss",
        speedrun: "Fast Mover",
      };
      return { name: byCard[this.goalCardId] ?? "Market Leader", note };
    }
    // "Steady Hand": kept the bakery staffed through a real downturn.
    const playerLaidOff = this.world.feed.some(
      (e) => e.kind === "layoff" && e.data?.workshop === this.playerWorkshopId,
    );
    const peakUnemployment = Math.max(0, ...this.world.metrics.map((m) => m.unemployment));
    if (!playerLaidOff && this.workshop.workers.length > 0 && peakUnemployment >= 0.15) {
      return { name: "Steady Hand", note: `Kept every worker through a downturn. ${note}` };
    }
    return null;
  }

  /** Headline, standings position and town health for the Scoreboard. */
  seasonSummary(): SeasonSummary {
    const rows = this.standings();
    const player = rows.find((r) => r.isPlayer)!;
    const leader = rows[0]!;
    const goal = this.goalCard();

    const headline = `You finished ${ORDINALS[player.rank - 1] ?? `#${player.rank}`}`;
    let blurb: string;
    if (player.rank === 1) {
      blurb = `You topped Millbrook on ${goal.name.toLowerCase()}. ${player.detail}`;
    } else {
      const coinGap = leader.profit - player.profit;
      const gap = coinGap > 0 ? `${leader.name} made ${coinGap.toLocaleString()} more coins than you. ` : "";
      blurb = `${gap}You kept ${player.workers} of your workers through the season, and the town noticed.`;
    }

    const migratedIn = this.world.feed.filter((e) => e.kind === "migration_in").length;
    const migratedOut = this.world.feed.filter((e) => e.kind === "migration_out").length;
    const bankruptcies = this.world.feed.filter((e) => e.kind === "bankruptcy").length;
    const parts: string[] = [];
    if (migratedIn) parts.push(`${migratedIn} ${migratedIn === 1 ? "family" : "families"} moved in`);
    if (migratedOut) parts.push(`${migratedOut} left for other towns`);
    parts.push(bankruptcies ? `${bankruptcies} workshop${bankruptcies === 1 ? "" : "s"} went bankrupt` : "nobody went bankrupt");
    const townNote = parts.join(", ").replace(/^./, (c) => c.toUpperCase()) + ".";

    const lastMetric = this.world.metrics.at(-1);
    return {
      day: Math.min(this.world.day, this.totalDays),
      totalDays: this.totalDays,
      goal,
      playerRank: player.rank,
      ownerCount: rows.length,
      headline,
      blurb,
      unemploymentPct: Math.round((lastMetric?.unemployment ?? unemploymentRate(this.world)) * 100),
      residents: lastMetric?.population ?? aliveResidents(this.world).length,
      coins: this.holdings().total,
      townNote,
      trophy: this.trophy(player.rank),
    };
  }

  // ── Gazette: a template built from the week's real events ───────────────────

  /**
   * A town newspaper for the most recent game week, written from the feed and
   * the price history. This is the deterministic template; the NEAR-AI-written
   * edition is M5 — the UI should say so.
   */
  gazette(): Gazette {
    const today = this.world.day; // days elapsed (0 on a brand-new season)
    const printDay = Math.max(1, today); // the dateline reads from day 1, never day 0
    const week = Math.max(1, Math.ceil(today / 7));
    const weekStart = (week - 1) * 7;
    const inWeek = this.world.feed.filter((e) => e.day >= weekStart && e.day < weekStart + 7);

    const pick = (kinds: FeedEventKind[]) => inWeek.filter((e) => kinds.includes(e.kind));

    // Lead story: the sharpest conflict of the week, else the busiest trade news.
    const strikes = pick(["strike_start"]);
    const wageCuts = pick(["wage_change"]);
    let lead: GazetteStory;
    if (strikes.length) {
      lead = {
        heading: "Workers down tools over pay",
        paragraphs: [
          strikes[0]!.text,
          ...pick(["strike_end"]).slice(0, 1).map((e) => e.text),
          "Shops that held their wages steady kept their workers — and picked up a few more.",
        ],
      };
    } else if (wageCuts.length) {
      lead = {
        heading: "Wages shift across the town",
        paragraphs: wageCuts.slice(0, 3).map((e) => e.text),
      };
    } else {
      const notable = this.seasonEvents(3).filter((e) => e.day > weekStart);
      lead = {
        heading: week <= 1 ? "A new season opens in Millbrook" : "A quiet week on the square",
        paragraphs:
          notable.length > 0
            ? notable.map((e) => e.text)
            : ["Trade kept to its rhythm this week: bread at dawn, cloth by noon, ale by dusk. The town's 10,000 coins changed hands many times and stayed, as ever, 10,000."],
      };
    }

    // Secondary: the Town Hall's safety net, if it acted.
    const hall = pick(["public_works", "benefit_paid"]);
    const secondary: GazetteStory | null = hall.length
      ? {
          heading: "Town Hall steadies the town",
          paragraphs: [
            hall[0]!.text,
            "The money comes from this week's taxes, so the town's 10,000 coins stay in town.",
          ],
        }
      : null;

    // Prices now vs a week ago, from the snapshots.
    const nowSnap = this.priceHistory.at(-1)!;
    const agoSnap = this.priceHistory.find((s) => s.day >= today - 7) ?? this.priceHistory[0]!;
    const priceRow = (good: string, key: keyof PriceSnapshot): GazettePriceRow => ({
      good,
      lastWeek: agoSnap.day === nowSnap.day ? null : (agoSnap[key] as number),
      now: nowSnap[key] as number,
    });
    const prices: GazettePriceRow[] = [
      priceRow("Bread", "bread"),
      priceRow("Cloth", "cloth"),
      priceRow("Tools", "tool"),
      priceRow("Ale", "ale"),
      priceRow("Wheat", "wheat"),
    ];

    const comingsAndGoings: string[] = [];
    const arrivals = pick(["migration_in"]);
    const departures = pick(["migration_out"]);
    if (arrivals.length) comingsAndGoings.push(arrivals[0]!.text);
    if (departures.length) comingsAndGoings.push(departures[0]!.text);
    if (comingsAndGoings.length === 0) comingsAndGoings.push("No one came or went this week. The town held at its usual size.");

    const notice =
      this.world.phase === "industrial"
        ? "Notice. The town has entered its Industrial phase: new machines and tools are changing the trades."
        : this.world.phase === "competition"
          ? "Notice. The town has entered its Competition phase: rivals are watching each other's prices closely."
          : "Notice. Settling days. The shops are finding their feet and their first regular customers.";

    return {
      week,
      day: printDay,
      dateline: `Week ${week} of this season, printed at dawn on day ${printDay}`,
      lead,
      secondary,
      prices,
      comingsAndGoings,
      notice,
    };
  }
}

/** Convenience for the common case: a solo season from just a seed. */
export function createSoloSession(seed: number, days = 28): SoloSession {
  return new SoloSession({ seed, days });
}

export type { Good, RawGood };
