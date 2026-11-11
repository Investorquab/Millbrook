/**
 * Ageing, retirement, death and inheritance — the "living town" (Phase-2).
 *
 * Opt-in via `config.ageing`, so the headless sim and the determinism tests are
 * untouched; the solo game and rooms turn it on. Once a game week, everyone ages
 * a year, those who reach 65 retire (out of the labour force, living on savings),
 * and the very old pass away peacefully — their savings going to an heir in town,
 * minus a 10% estate tax to the Town Hall, or all to the Town Hall if there is no
 * heir. Coins only ever move between accounts, so the 10,000-coin total holds.
 */

import { TOWN_HALL_ID } from "@millbrook/shared";
import type { Resident, World } from "./types.js";
import { aliveResidents } from "./rules.js";
import { pushFeed } from "./engine.js";

/** A game week is seven days; residents age a year each week. */
export const AGE_WEEK_DAYS = 7;
/** Residents retire at 65, living on their savings. */
export const RETIRE_AGE = 65;
/** The very old pass away peacefully at this age. */
export const DEATH_AGE = 72;
/** Share of an estate taken by the Town Hall when there is an heir. */
export const ESTATE_TAX_RATE = 0.1;

/**
 * Run the weekly demographic step. A no-op unless ageing is on and today closes a
 * game week. Called from {@link endOfDay} after the day has advanced and before
 * the invariant is checked, so any inheritance transfers are covered by it.
 */
export function runAgeing(world: World): void {
  if (!world.config.ageing) return;
  if (world.day <= 0 || world.day % AGE_WEEK_DAYS !== 0) return;

  // 1) Everyone gets a year older.
  for (const r of aliveResidents(world)) r.age += 1;

  // 2) Those who have reached 65 retire from work to live on their savings.
  for (const r of aliveResidents(world)) {
    if (!r.retired && r.age >= RETIRE_AGE) retire(world, r);
  }

  // 3) The very old pass away peacefully; their savings pass on in town.
  for (const r of aliveResidents(world)) {
    if (r.age >= DEATH_AGE) passAway(world, r);
  }
}

/** Leave the workforce: drop the job, keep shopping on savings. */
function retire(world: World, r: Resident): void {
  leaveJob(world, r);
  r.retired = true;
  r.daysUnemployed = 0;
  r.lastReason = `Retired at ${r.age}, living on savings.`;
  pushFeed(world, "retire", `${r.name} retired at ${r.age}, after a working life in Millbrook.`, {
    resident: r.id,
    age: r.age,
  });
}

/** Pass away peacefully; savings go to an heir (−10% estate tax) or the Town Hall. */
function passAway(world: World, r: Resident): void {
  leaveJob(world, r);
  r.alive = false;
  r.retired = false;

  const savings = world.ledger.get(r.id);
  const heir = pickHeir(world, r);
  if (savings > 0) {
    if (heir) {
      const tax = Math.floor(savings * ESTATE_TAX_RATE);
      const toHeir = savings - tax;
      if (tax > 0) world.ledger.transfer(r.id, TOWN_HALL_ID, tax);
      if (toHeir > 0) world.ledger.transfer(r.id, heir.id, toHeir);
      pushFeed(
        world,
        "death",
        `${r.name} passed away peacefully at ${r.age}. ${toHeir} coins went to ${heir.name}; ${tax} in estate tax to the Town Hall.`,
        { resident: r.id, heir: heir.id, amount: toHeir, tax },
      );
    } else {
      world.ledger.transfer(r.id, TOWN_HALL_ID, savings);
      pushFeed(
        world,
        "death",
        `${r.name} passed away peacefully at ${r.age}, with no heir; ${savings} coins went to the Town Hall.`,
        { resident: r.id, amount: savings },
      );
    }
  } else {
    pushFeed(world, "death", `${r.name} passed away peacefully at ${r.age}.`, { resident: r.id });
  }
}

/** Remove a resident from whatever they work at, if anything. */
function leaveJob(world: World, r: Resident): void {
  if (r.employerId === null) return;
  if (r.employerId === world.coop.id) {
    world.coop.workers = world.coop.workers.filter((id) => id !== r.id);
  } else {
    const w = world.workshops.get(r.employerId);
    if (w) w.workers = w.workers.filter((id) => id !== r.id);
  }
  r.employerId = null;
}

/**
 * Choose an heir: a living working-age resident in town (not the deceased, not
 * retired), picked deterministically. Falls back to any living resident, then to
 * no heir at all (everything to the Town Hall).
 */
function pickHeir(world: World, deceased: Resident): Resident | null {
  const living = aliveResidents(world).filter((r) => r.id !== deceased.id);
  const working = living.filter((r) => !r.retired);
  const pool = working.length > 0 ? working : living;
  if (pool.length === 0) return null;
  return world.rng.pick(pool);
}
