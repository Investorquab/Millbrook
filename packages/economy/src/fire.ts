/**
 * Fire and insurance (Phase-2). A workshop can catch fire and lose its finished
 * stock. Insured shops pay a small daily premium into the Town Co-op's insurance
 * pool and are paid a claim from it when fire strikes, so they can restock.
 *
 * Opt-in via `config.fire` (off headless/determinism; the solo game turns it on,
 * from Phase 2). Fire destroys *goods*, never coins; premiums and claims only
 * move coins between a shop and the Co-op's pool — so the 10,000-coin total is
 * never affected.
 */

import { COOP_ID, PHASE_BOUNDARIES } from "@millbrook/shared";
import type { Workshop, World } from "./types.js";
import { WORKSHOP_DEFS } from "./rules.js";
import { pushFeed } from "./engine.js";

/** Daily premium an insured shop pays into the pool. */
export const INSURANCE_PREMIUM = 2;
/** Chance per open shop per day of a fire, once the town has industrialised. */
export const FIRE_CHANCE = 0.012;

/**
 * Collect premiums, then maybe start one fire and settle its claim. Called from
 * {@link endOfDay}; it touches goods and conserving coin moves only, so the
 * invariant below still holds at exactly 10,000.
 */
export function runFire(world: World): void {
  if (!world.config.fire) return;

  // 1) Insured shops pay today's premium into the Co-op's pool.
  for (const w of world.workshops.values()) {
    if (w.open && !w.bankrupt && w.insured) {
      world.ledger.payUpTo(w.id, COOP_ID, INSURANCE_PREMIUM);
    }
  }

  // Fires only once the town has industrialised and has something to lose.
  if (world.day < PHASE_BOUNDARIES.competition) return;

  // 2) At most one fire a day, at a random eligible shop.
  const eligible = [...world.workshops.values()].filter(
    (w) => w.open && !w.bankrupt && w.outputStock >= 1,
  );
  if (eligible.length === 0) return;
  if (!world.rng.chance(FIRE_CHANCE * eligible.length)) return;

  const w = world.rng.pick(eligible);
  const lost = Math.floor(w.outputStock);
  w.outputStock = 0;
  settleFire(world, w, lost);
}

function settleFire(world: World, w: Workshop, lostUnits: number): void {
  const owner = world.owners.get(w.ownerId);
  const who = owner?.kind === "player" ? "your" : `${owner?.name ?? "a"}'s`;
  if (w.insured) {
    // The pool pays a claim worth the lost stock (capped by what it holds), so
    // the shop can restock — coins move Co-op → shop, conserving the total.
    const claim = world.ledger.payUpTo(COOP_ID, w.id, lostUnits * w.price);
    pushFeed(
      world,
      "fire",
      `Fire at ${who} ${w.type}! ${lostUnits} ${WORKSHOP_DEFS[w.type].output} lost — insurance paid ${claim} coins from the Co-op pool.`,
      { workshop: w.id, lost: lostUnits, claim },
    );
  } else {
    pushFeed(world, "fire", `Fire at ${who} ${w.type}! ${lostUnits} ${WORKSHOP_DEFS[w.type].output} lost — uninsured.`, {
      workshop: w.id,
      lost: lostUnits,
    });
  }
}
