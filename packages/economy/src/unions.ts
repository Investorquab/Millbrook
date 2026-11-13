/**
 * Unions (Phase-2). When a shop pays clearly below the town average for several
 * days running, its workers organise. A unionised shop that keeps wages low gets
 * a strike sooner than an unorganised one — the collective has more leverage.
 * The Game Master's `union_forms` event organises the lowest-paid trade at once.
 *
 * Opt-in via `config.unions`. Unions move no coins themselves (a strike stops
 * production, which the existing wage/sales loop already handles), so the
 * 10,000-coin total is untouched.
 */

import { pushFeed } from "./engine.js";
import type { World } from "./types.js";

/** Consecutive low-wage days before a union forms. */
export const UNION_FORM_DAYS = 4;
/** Below this fraction of the average wage counts as "clearly underpaid". */
const ORGANISING_RATIO = 0.8;
/** A union strikes at a higher wage line than unorganised workers (0.8). */
const UNION_STRIKE_RATIO = 0.9;
/** How long a union strike lasts. */
const UNION_STRIKE_DAYS = 2;

/** The average daily wage across the open shops. */
function averageWage(world: World): number {
  const open = [...world.workshops.values()].filter((w) => w.open && !w.bankrupt);
  if (open.length === 0) return 0;
  return open.reduce((s, w) => s + w.wage, 0) / open.length;
}

/** Track low-wage streaks, form unions, and let a union strike over low pay. */
export function runUnions(world: World): void {
  if (!world.config.unions) return;
  const avg = averageWage(world);
  if (avg <= 0) return;

  for (const w of world.workshops.values()) {
    if (!w.open || w.bankrupt) {
      w.unionDays = 0;
      continue;
    }
    if (w.wage < avg * ORGANISING_RATIO) {
      w.unionDays += 1;
      if (!w.unionised && w.unionDays >= UNION_FORM_DAYS) formUnion(world, w.id);
    } else {
      w.unionDays = 0;
    }

    // A unionised shop that still underpays triggers a collective walkout.
    if (w.unionised && w.strikeDays === 0 && w.workers.length > 0 && w.wage < avg * UNION_STRIKE_RATIO) {
      w.strikeDays = UNION_STRIKE_DAYS;
      pushFeed(world, "strike_start", `The ${w.type} union called a strike over low pay.`, { workshop: w.id });
    }
  }
}

/** Organise one shop's workers into a union (used by the `union_forms` event). */
export function formUnion(world: World, workshopId: string): void {
  const w = world.workshops.get(workshopId);
  if (!w || w.unionised) return;
  w.unionised = true;
  pushFeed(world, "gm_event", `Workers at the ${w.type} formed a union to bargain for fair pay.`, {
    workshop: w.id,
  });
}

/** The lowest-paid open shop with workers — whom `union_forms` organises. */
export function lowestPaidShop(world: World): string | undefined {
  const staffed = [...world.workshops.values()].filter((w) => w.open && !w.bankrupt && w.workers.length > 0);
  if (staffed.length === 0) return undefined;
  return staffed.reduce((lo, w) => (w.wage < lo.wage ? w : lo)).id;
}
