/**
 * Elections — the town governs itself (Phase-2 civic layer).
 *
 * Opt-in via `config.elections`, so headless sims and determinism tests are
 * untouched; the solo game turns it on. At each phase boundary the residents
 * elect a Mayor, each voting by their own welfare: the comfortable and employed
 * favour a thrifty Mayor (lower taxes), the jobless and poor a caring one (more
 * benefits and a minimum wage). The winner sets the Town Hall's tax and benefit
 * policy for the phase. Only rates change — no coins move — so the 10,000-coin
 * total always holds.
 */

import type { Mayor, World } from "./types.js";
import { UNEMPLOYMENT_BENEFIT, aliveResidents } from "./rules.js";
import { pushFeed } from "./engine.js";

/** The game days an election is held on (the phase boundaries). */
export const ELECTION_DAYS = [10, 20];
/** A voter with at least this saved counts as comfortable (prefers low taxes). */
export const COMFORTABLE_SAVINGS = 40;

/** The two platforms a Mayor can govern on. */
export const MAYOR_POLICY: Record<"thrifty" | "caring", {
  wageTaxRate: number;
  salesTaxRate: number;
  benefit: number;
  minimumWage: number;
}> = {
  thrifty: { wageTaxRate: 0.12, salesTaxRate: 0.08, benefit: UNEMPLOYMENT_BENEFIT, minimumWage: 0 },
  caring: { wageTaxRate: 0.18, salesTaxRate: 0.12, benefit: UNEMPLOYMENT_BENEFIT + 1, minimumWage: 6 },
};

/**
 * Hold an election if one is due today. Called from {@link endOfDay} after the
 * day has advanced, so it lands exactly on a phase boundary.
 */
export function runElections(world: World): void {
  if (!world.config.elections) return;
  if (!ELECTION_DAYS.includes(world.day)) return;

  // Each resident votes by their welfare: employed or comfortably saved → thrifty.
  let thrifty = 0;
  let caring = 0;
  for (const r of aliveResidents(world)) {
    const comfortable = r.employerId !== null || world.ledger.get(r.id) >= COMFORTABLE_SAVINGS;
    if (comfortable) thrifty += 1;
    else caring += 1;
  }

  const winner: Mayor = caring > thrifty ? "caring" : "thrifty";
  const policy = MAYOR_POLICY[winner];
  world.townHall.mayor = winner;
  world.townHall.wageTaxRate = policy.wageTaxRate;
  world.townHall.salesTaxRate = policy.salesTaxRate;
  world.townHall.benefit = policy.benefit;
  world.townHall.minimumWage = policy.minimumWage;

  const total = thrifty + caring;
  const text =
    winner === "thrifty"
      ? `Millbrook elected a thrifty Mayor (${thrifty}–${caring}): lower taxes, lean benefits.`
      : `Millbrook elected a caring Mayor (${caring}–${thrifty}): more benefits and a minimum wage of ${policy.minimumWage}.`;
  pushFeed(world, "election", text, { mayor: winner, thrifty, caring, voters: total });
}

/**
 * Enforce the Mayor's minimum wage: no open shop may pay below it. Nudges wages
 * only — the ledger is untouched — so the invariant is unaffected. Also pulls
 * the Co-op up to the floor. A no-op when there is no minimum wage.
 */
export function enforceMinimumWage(world: World): void {
  const floor = world.townHall.minimumWage;
  if (floor <= 0) return;
  for (const w of world.workshops.values()) {
    if (w.open && !w.bankrupt && w.wage < floor) w.wage = floor;
  }
  if (world.coop.wage < floor) world.coop.wage = floor;
}
