/**
 * Theft — the cost of a town left to struggle (Phase-2 consequence).
 *
 * Opt-in via `config.theft`, so headless sims and determinism tests are
 * untouched; the solo game turns it on. When unemployment runs above the
 * threshold, a little of each shop's finished stock goes missing overnight.
 * Goods are lost, never coins, so the 10,000-coin total is never affected — the
 * damage is to the shops' inventories, and the only real fix is to get the town
 * back to work.
 */

import { TOWN_HALL_ID } from "@millbrook/shared";
import type { World } from "./types.js";
import { unemploymentRate, aliveResidents } from "./rules.js";
import { pushFeed } from "./engine.js";

/** Theft begins once unemployment passes this share of the labour force. */
export const THEFT_UNEMPLOYMENT = 0.2;
/** Share of a shop's finished stock that can go missing in a bad night. */
export const THEFT_RATE = 0.1;
/** The daily wage a guarded shop pays the watch on a bad night. */
export const GUARD_WAGE = 4;

/**
 * Lose a little stock from each shop when the town is struggling. Called from
 * {@link endOfDay}; it only reduces goods, so the ledger (and its invariant) is
 * never touched.
 */
export function runTheft(world: World): void {
  if (!world.config.theft) return;
  if (unemploymentRate(world) <= THEFT_UNEMPLOYMENT) return;

  // A resident the watch can be paid to, so the guard wage recirculates.
  const watchman = aliveResidents(world).find((r) => r.employerId === null) ?? null;

  let stolen = 0;
  let guardsPaid = 0;
  for (const w of world.workshops.values()) {
    if (!w.open || w.bankrupt) continue;
    if (w.guarded) {
      // Post the watch: a watch wage keeps the stock safe. Paid to an idle
      // resident if there is one, else to the Town Hall — coins stay in town.
      const to = watchman ? watchman.id : TOWN_HALL_ID;
      if (world.ledger.payUpTo(w.id, to, GUARD_WAGE) > 0) guardsPaid += 1;
      continue;
    }
    const loss = Math.floor(w.outputStock * THEFT_RATE);
    if (loss >= 1) {
      w.outputStock -= loss;
      stolen += loss;
    }
  }
  if (stolen > 0) {
    pushFeed(world, "theft", `Hard times: ${stolen} goods went missing from the shops overnight.`, { stolen });
  }
  if (guardsPaid > 0) {
    pushFeed(world, "theft", `${guardsPaid} shop${guardsPaid === 1 ? "" : "s"} posted a guard overnight.`, {
      guards: guardsPaid,
    });
  }
}
