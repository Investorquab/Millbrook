/**
 * Rent and housing (Phase-2). Residents pay a small daily rent to the Town Hall
 * out of the wage they earned, a town that outgrows its houses leaves its
 * poorest without a home (and the homeless drift away), and the Town Hall builds
 * more houses when there is pressure — paying residents to build them.
 *
 * Opt-in via `config.housing` (off headless/determinism; the solo game turns it
 * on). Only coins between residents and the Town Hall move, so the 10,000-coin
 * total is never affected. Capacity (`world.houses`) grows with construction.
 */

import { TOWN_HALL_ID } from "@millbrook/shared";
import type { Resident, World } from "./types.js";
import { aliveResidents } from "./rules.js";
import { pushFeed } from "./engine.js";

/** Rent a housed resident pays each day they earned a wage. */
export const RENT_PER_DAY = 1;
/** What the Town Hall pays in construction wages to raise one new house. */
export const HOUSE_BUILD_COST = 12;
/** House parts (from the Carpenter) that make one house. */
export const PARTS_PER_HOUSE = 5;
/** With a Carpenter open, the Town Hall keeps this many spare houses ahead of
 *  the population — so the Carpenter has steady sales and the town can grow. */
export const CARPENTER_HOUSE_BUFFER = 8;

/**
 * Collect rent, note who is homeless, and build a house. Called from
 * {@link endOfDay} after wages, before migration-out, so the homeless are more
 * likely to leave this very day. When a Carpenter is open the house is built
 * from its parts (the Town Hall buys them — real sales for the carpenter);
 * otherwise the Town Hall builds directly, only under housing pressure.
 */
export function runHousing(world: World): void {
  if (!world.config.housing) return;

  const residents = aliveResidents(world);

  // 1) Rent, out of today's wage, to the Town Hall (the town's public landlord).
  for (const r of residents) {
    if (r.lastWage > 0) world.ledger.payUpTo(r.id, TOWN_HALL_ID, RENT_PER_DAY);
  }

  // 2) Homelessness: a town over capacity leaves its poorest without a home.
  const homeless = Math.max(0, residents.length - world.houses);
  if (homeless > 0) {
    // Mark the poorest as homeless, so migration-out weighs on them today.
    const poorestFirst = [...residents].sort(
      (a, b) => world.ledger.get(a.id) - world.ledger.get(b.id),
    );
    for (let i = 0; i < homeless && i < poorestFirst.length; i++) {
      const r = poorestFirst[i]!;
      if (r.employerId === null) r.daysUnemployed += 1; // nudge toward leaving
      r.lastReason = "No home in Millbrook — thinking of moving on.";
    }
  }

  // 3) Build a house.
  buildHouse(world, residents, homeless);
}

/** Raise one house — from the Carpenter's parts if one trades, else directly. */
function buildHouse(world: World, residents: Resident[], homeless: number): void {
  const hall = world.ledger.get(TOWN_HALL_ID);
  const carpenter = [...world.workshops.values()].find(
    (w) => w.type === "carpenter" && w.open && !w.bankrupt,
  );

  if (carpenter) {
    // The Town Hall buys parts from the carpenter and keeps a buffer ahead of
    // the population (coins Town Hall → carpenter; the total never changes).
    if (world.houses >= residents.length + CARPENTER_HOUSE_BUFFER) return;
    if (carpenter.outputStock < PARTS_PER_HOUSE) return;
    const cost = carpenter.price * PARTS_PER_HOUSE;
    if (hall < cost) return;
    const paid = world.ledger.payUpTo(TOWN_HALL_ID, carpenter.id, cost);
    carpenter.outputStock -= PARTS_PER_HOUSE;
    carpenter.soldToday += PARTS_PER_HOUSE;
    carpenter.revenueToday += paid;
    world.houses += 1;
    pushFeed(
      world,
      "public_works",
      `The Town Hall bought ${PARTS_PER_HOUSE} house parts from the carpenter and raised a new house; the town now has ${world.houses}.`,
      { houses: world.houses },
    );
    return;
  }

  // No carpenter: the Town Hall builds directly only under housing pressure,
  // paying idle residents the construction wages (byte-identical to before).
  if (homeless <= 0 || hall < HOUSE_BUILD_COST) return;
  const builders = [...residents]
    .sort((a, b) => world.ledger.get(a.id) - world.ledger.get(b.id))
    .filter((r) => r.employerId === null);
  if (builders.length === 0) return;
  payBuilders(world, builders, HOUSE_BUILD_COST);
  world.houses += 1;
  pushFeed(world, "public_works", `The Town Hall built a new house; the town now has ${world.houses}.`, {
    houses: world.houses,
  });
}

/** Split the construction wage across the available builders. */
function payBuilders(world: World, builders: Resident[], budget: number): void {
  const n = Math.min(builders.length, 3);
  const each = Math.floor(budget / n);
  let paid = 0;
  for (let i = 0; i < n; i++) {
    const got = world.ledger.payUpTo(TOWN_HALL_ID, builders[i]!.id, each);
    builders[i]!.lastWage += got;
    paid += got;
  }
  // Any rounding remainder stays with the Town Hall (nothing leaves town).
  void paid;
}
