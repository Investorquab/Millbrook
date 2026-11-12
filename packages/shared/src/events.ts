/**
 * The town-feed event catalog and the Game Master event catalog. The engine
 * emits feed events as it runs; the Game Master (M4) picks from the GM catalog
 * within the hard caps declared here. Caps are data so the contract and the
 * tests can both read them.
 */

import type { WorkshopType } from "./goods.js";

/** Kinds of thing that show up in the town feed / Gazette. */
export const FEED_EVENT_KINDS = [
  "wage_change",
  "price_change",
  "hire",
  "layoff",
  "job_change",
  "strike_start",
  "strike_end",
  "migration_in",
  "migration_out",
  "birth",
  "retire",
  "death",
  "bankruptcy",
  "auction",
  "theft",
  "benefit_paid",
  "public_works",
  "election",
  "phase_change",
  "gm_event",
  "sale_summary",
  "trade",
] as const;
export type FeedEventKind = (typeof FEED_EVENT_KINDS)[number];

export interface FeedEvent {
  /** Game day (0-indexed) the event happened on. */
  day: number;
  kind: FeedEventKind;
  /** One short sentence for the feed and the Gazette. */
  text: string;
  /** Optional structured payload (resident id, workshop id, amounts…). */
  data?: Record<string, number | string | boolean>;
}

/** The Game Master event catalog (12 to start), with hard caps. */
export interface GameMasterEvent {
  id: string;
  title: string;
  /** One sentence shown on the event card. */
  effect: string;
  trigger: "weather" | "price" | "random" | "leader" | "stuck" | "phase" | "low_wages" | "doing_well";
  /** Which phase (0 = any) this becomes available in. */
  minPhaseDay: number;
  caps: {
    /** Maximum price multiplier the effect may apply. */
    maxPriceMultiplier?: number;
    /** Maximum duration in game days. */
    maxDays: number;
    /** Workshop the effect targets, if specific. */
    workshop?: WorkshopType;
  };
}

export const GAME_MASTER_EVENTS: readonly GameMasterEvent[] = [
  { id: "drought", title: "Drought", effect: "Wheat costs up to 3× more for 5 days.", trigger: "weather", minPhaseDay: 0, caps: { maxPriceMultiplier: 3, maxDays: 5 } },
  { id: "bumper_harvest", title: "Bumper harvest", effect: "Wheat is half price for 3 days.", trigger: "random", minPhaseDay: 0, caps: { maxPriceMultiplier: 0.5, maxDays: 3 } },
  { id: "heatwave", title: "Heatwave", effect: "Residents work 20% less for 2 days.", trigger: "weather", minPhaseDay: 0, caps: { maxDays: 2 } },
  { id: "railway", title: "Railway arrives", effect: "An outside trader sells cheap bread for 4 days.", trigger: "leader", minPhaseDay: 0, caps: { maxDays: 4 } },
  { id: "tax_inspector", title: "Tax inspector", effect: "The richest owner pays 10% to the Town Co-op.", trigger: "leader", minPhaseDay: 0, caps: { maxDays: 1 } },
  { id: "new_machine", title: "New machine", effect: "Doubles one workshop's output but needs half the workers.", trigger: "phase", minPhaseDay: 20, caps: { maxDays: 28 } },
  { id: "festival", title: "Festival", effect: "Demand for all goods doubles for 1 day.", trigger: "stuck", minPhaseDay: 0, caps: { maxDays: 1 } },
  { id: "cotton_blight", title: "Cotton blight", effect: "Cotton supply down 50% for 4 days.", trigger: "random", minPhaseDay: 0, caps: { maxPriceMultiplier: 2, maxDays: 4 } },
  { id: "iron_shortage", title: "Iron shortage", effect: "Tools cost double for 4 days.", trigger: "random", minPhaseDay: 0, caps: { maxPriceMultiplier: 2, maxDays: 4 } },
  { id: "migration_wave", title: "Migration wave", effect: "Five new residents arrive looking for work.", trigger: "doing_well", minPhaseDay: 0, caps: { maxDays: 1 } },
  { id: "bank_panic", title: "Bank panic", effect: "Loans are called in early.", trigger: "random", minPhaseDay: 20, caps: { maxDays: 1 } },
  { id: "union_forms", title: "Union forms", effect: "Workers in one trade bargain together.", trigger: "low_wages", minPhaseDay: 0, caps: { maxDays: 28 } },
  { id: "epidemic", title: "A sickness spreads", effect: "Sick workers miss shifts; output falls for 3 days.", trigger: "random", minPhaseDay: 10, caps: { maxDays: 3 } },
] as const;

/** Hard limits enforced regardless of the AI's choice. */
export const GAME_MASTER_LIMITS = {
  maxEventsPerGameWeek: 1,
  /** Plus one shock at the start of Phase 3 (day 20). */
  phase3ShockDay: 20,
  gameWeekDays: 7,
} as const;
