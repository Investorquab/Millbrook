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

import type { Good, Phase, RawGood, WorkshopType } from "@millbrook/shared";
import { createWorld } from "./state.js";
import { pushFeed, stepDay } from "./engine.js";
import { WORKSHOP_DEFS, aliveResidents, townAverageWage, unemploymentRate } from "./rules.js";
import type { SeasonConfig, Workshop, World } from "./types.js";

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

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
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

export class SoloSession {
  readonly world: World;
  readonly playerWorkshopId: string;
  private readonly totalDays: number;
  private prevCoins: number;
  private prevUnemployment: number;
  private coinsDelta = 0;
  private profitToday = 0;
  private unemploymentRising = false;

  constructor(config: SeasonConfig) {
    // A predictable solo town: the four Phase-1 workshops in a fixed order so
    // the player always runs the bakery, with the AI owners on the rest.
    this.world = createWorld({
      openWorkshops: ["bakery", "weaver", "smithy", "brewery"],
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

    this.prevCoins = this.world.ledger.get(this.playerWorkshopId);
    this.prevUnemployment = unemploymentRate(this.world);
  }

  private get workshop(): Workshop {
    return this.world.workshops.get(this.playerWorkshopId)!;
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  setPrice(price: number): void {
    this.workshop.price = clamp(price, PRICE_MIN, PRICE_MAX);
  }

  setWage(wage: number): void {
    this.workshop.wage = clamp(wage, WAGE_MIN, WAGE_MAX);
  }

  /** Hire one idle resident into the bakery. Returns false if it couldn't. */
  hire(): boolean {
    const w = this.workshop;
    if (w.bankrupt || w.workers.length >= w.maxWorkers) return false;
    const idle = aliveResidents(this.world).find((r) => r.employerId === null);
    if (!idle) return false;
    idle.employerId = w.id;
    idle.daysUnemployed = 0;
    idle.lastReason = `Hired at your bakery for ${w.wage} a day.`;
    w.workers.push(idle.id);
    pushFeed(this.world, "hire", `You hired ${idle.name} at your bakery for ${w.wage} a day.`, {
      resident: idle.id,
      workshop: w.id,
    });
    return true;
  }

  /** Advance one game day. No-op once the season has ended. */
  step(): void {
    if (this.world.day >= this.totalDays) return;
    const beforeCoins = this.world.ledger.get(this.playerWorkshopId);
    const beforeUnemp = unemploymentRate(this.world);
    stepDay(this.world);
    const afterCoins = this.world.ledger.get(this.playerWorkshopId);
    this.coinsDelta = afterCoins - beforeCoins;
    this.profitToday = afterCoins - beforeCoins;
    this.prevCoins = afterCoins;
    this.unemploymentRising = unemploymentRate(this.world) > beforeUnemp + 1e-9;
    this.prevUnemployment = beforeUnemp;
  }

  // ── Reasons (real data, short sentences for the tooltip) ────────────────────

  private priceReason(): string {
    const w = this.workshop;
    const def = WORKSHOP_DEFS[w.type];
    const wheat = this.world.coop.rawPrices[def.input as RawGood] ?? 0;
    const cost = def.inputPerOutput * wheat;
    if (w.price <= cost) return `Below your wheat cost of ${cost.toFixed(1)} — you lose on every loaf.`;
    const avgWage = townAverageWage(this.world);
    if (w.price <= avgWage * 0.4) return "Cheap — most residents can easily afford it.";
    if (w.price <= avgWage * 0.6) return "A fair price most residents can afford.";
    return "Steep — only the well-paid will buy at this price.";
  }

  private wageReason(): string {
    const w = this.workshop;
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

  view(): SoloView {
    const w = this.workshop;
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

      coins: this.world.ledger.get(this.playerWorkshopId),
      coinsDelta: this.coinsDelta,

      unemploymentPct: Math.round(unemploymentRate(this.world) * 100),
      unemploymentRising: this.unemploymentRising,
      mood: this.mood(),
      avgWage: townAverageWage(this.world),

      workshopType: w.type,
      price: w.price,
      wage: w.wage,
      priceReason: this.priceReason(),
      wageReason: this.wageReason(),
      stock: Math.floor(w.outputStock),
      soldToday: Math.floor(w.soldToday),
      profitToday: this.profitToday,
      workers,
      maxWorkers: w.maxWorkers,
      canHire: !w.bankrupt && w.workers.length < w.maxWorkers,
      onStrike: w.strikeDays > 0,
      bankrupt: w.bankrupt,

      feed,
    };
  }
}

/** Convenience for the common case: a solo season from just a seed. */
export function createSoloSession(seed: number, days = 28): SoloSession {
  return new SoloSession({ seed, days });
}

export type { Good, RawGood };
