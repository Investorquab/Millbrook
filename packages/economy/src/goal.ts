/**
 * Goal-card runtime (Step 4). A season can be scored against one of the 20 goal
 * cards in `scoring.ts`. A few cards change the opening situation (Underdog's lop-
 * sided purses, the Great Depression's layoffs) or stage an event mid-season
 * (Last Will's death, the Epidemic card's outbreak); others need a running total
 * the day-by-day sim must keep (coins traded, a lead-seller streak). This module
 * holds that runtime: it is only ever attached by the SoloSession (and rooms), so
 * headless sims leave `world.goal` undefined and their determinism is untouched.
 *
 * Every setup here conserves coins — purses are only moved between holders in
 * town — so the 10,000-coin invariant still holds.
 */

import { COOP_ID, TOWN_HALL_ID } from "@millbrook/shared";
import { WORKSHOP_DEFS } from "./rules.js";
import { pushFeed } from "./engine.js";
import type { GoalTrack, World, Workshop } from "./types.js";

/** Starting purses for the Underdog card. */
const UNDERDOG_PLAYER = 200;
const UNDERDOG_RIVAL = 1000;
/** Homeless families that arrive for the Housing Crisis card. */
const HOUSING_CRISIS_ARRIVALS = 10;

function freshTrack(): GoalTrack {
  return { coinsTraded: 0, soldTotal: 0, leadStreak: 0, leadStreakBest: 0, fullStaffDay: null };
}

/** Attach a goal card to the world and apply its opening setup. Call once, before
 *  the season starts (day 0). */
export function initGoal(world: World, cardId: string): void {
  const track = new Map<string, GoalTrack>();
  for (const id of world.workshops.keys()) track.set(id, freshTrack());
  world.goal = { cardId, track, fired: new Set() };
  applyStartSetup(world, cardId);
}

/** The player's workshops (owner kind "player") — empty in a pure-AI town. */
function playerWorkshops(world: World): Workshop[] {
  return [...world.workshops.values()].filter((w) => world.owners.get(w.ownerId)?.kind === "player");
}

/** Move `id`'s balance to exactly `target`, buffering the difference against the
 *  Co-op then the Town Hall, so the town total never changes. */
function setBalance(world: World, id: string, target: number): void {
  const current = world.ledger.get(id);
  if (target > current) {
    let need = target - current;
    for (const buf of [COOP_ID, TOWN_HALL_ID]) {
      if (need <= 0) break;
      need -= world.ledger.payUpTo(buf, id, need);
    }
  } else if (target < current) {
    world.ledger.payUpTo(id, COOP_ID, current - target);
  }
}

// ── Opening setups (day 0) ───────────────────────────────────────────────────

function applyStartSetup(world: World, cardId: string): void {
  switch (cardId) {
    case "underdog": {
      // The player starts poor, the rivals rich; the rest sits with the Co-op.
      const players = new Set(playerWorkshops(world).map((w) => w.id));
      for (const w of world.workshops.values()) {
        const target = players.has(w.id) ? UNDERDOG_PLAYER : UNDERDOG_RIVAL;
        setBalance(world, w.id, target);
        w.startingCoins = world.ledger.get(w.id); // so "profit gained" starts at 0
      }
      break;
    }
    case "great_depression": {
      // Lay off roughly a third of the workforce to open at ~30% unemployment.
      layOffFraction(world, 0.3);
      break;
    }
    case "ageing_town": {
      // Half the town is already elderly and retiring out of the labour force.
      retireFraction(world, 0.5);
      break;
    }
    case "housing_crisis": {
      // Ten homeless families arrive looking for a roof (town now over capacity).
      for (let i = 0; i < HOUSING_CRISIS_ARRIVALS; i++) addArrival(world, "A homeless family arrived in Millbrook.");
      break;
    }
    default:
      break;
  }
}

/** Lay off the first `frac` of employed residents (deterministic by map order). */
function layOffFraction(world: World, frac: number): void {
  const employed = [...world.residents.values()].filter((r) => r.alive && r.employerId);
  const n = Math.floor(employed.length * frac);
  for (let i = 0; i < n; i++) {
    const r = employed[i]!;
    const shop = r.employerId ? world.workshops.get(r.employerId) : undefined;
    if (shop) shop.workers = shop.workers.filter((id) => id !== r.id);
    r.employerId = null;
    r.daysUnemployed = 1;
  }
}

/** Retire the first `frac` of residents out of the labour force. */
function retireFraction(world: World, frac: number): void {
  const living = [...world.residents.values()].filter((r) => r.alive && !r.retired);
  const n = Math.floor(living.length * frac);
  for (let i = 0; i < n; i++) {
    const r = living[i]!;
    const shop = r.employerId ? world.workshops.get(r.employerId) : undefined;
    if (shop) shop.workers = shop.workers.filter((id) => id !== r.id);
    r.employerId = null;
    r.retired = true;
    r.age = Math.max(r.age, 66);
  }
}

/** Add one resident with a small Town-Hall stipend (coins stay in town). */
function addArrival(world: World, reason: string): void {
  const id = `r${world.nextResidentNumber++}`;
  world.ledger.ensure(id);
  const stipend = world.ledger.payUpTo(TOWN_HALL_ID, id, 15);
  world.residents.set(id, {
    id,
    name: `Newcomer ${world.nextResidentNumber}`,
    trait: world.rng.pick(["thrifty", "loyal", "ambitious"]),
    age: world.rng.int(18, 45),
    retired: false,
    childUntilDay: 0,
    employerId: null,
    lastWage: stipend,
    daysUnemployed: 1,
    clothLastDay: world.day,
    clothesLastDay: world.day,
    ateToday: false,
    hungryDays: 0,
    alive: true,
    lastReason: reason,
  });
}

// ── Daily tracking + mid-season events ───────────────────────────────────────

/** Advance the goal's running totals and fire any day-triggered scenario. Called
 *  from endOfDay after the metrics for `world.day` are recorded. A no-op without
 *  an active goal, so headless determinism is untouched. */
export function trackGoalDay(world: World): void {
  const goal = world.goal;
  if (!goal) return;

  // Running per-workshop totals.
  for (const w of world.workshops.values()) {
    const t = goal.track.get(w.id);
    if (!t) continue;
    t.soldTotal += w.soldToday;
    const good = WORKSHOP_DEFS[w.type].output;
    const leads = w.soldToday > 0 && isLeadSeller(world, w, good);
    t.leadStreak = leads ? t.leadStreak + 1 : 0;
    if (t.leadStreak > t.leadStreakBest) t.leadStreakBest = t.leadStreak;
    if (!w.bankrupt && w.workers.length >= w.maxWorkers && t.fullStaffDay === null) {
      t.fullStaffDay = world.day;
    }
  }

  // Mid-season scenarios (once each).
  if (goal.cardId === "epidemic" && world.day === 5 && !goal.fired.has("epidemic")) {
    goal.fired.add("epidemic");
    world.gm.active.push({
      id: "epidemic",
      title: "Epidemic",
      effect: "Sickness cuts every shop's output.",
      startDay: world.day,
      remainingDays: 3,
      params: { outputMultiplier: 0.6 },
    });
    pushFeed(world, "gm_event", "An epidemic swept into Millbrook — every shop will produce less for days.", {
      id: "epidemic",
    });
  }
  if (goal.cardId === "last_will" && world.day === 7 && !goal.fired.has("last_will")) {
    goal.fired.add("last_will");
    stageLastWillDeath(world);
  }
}

/** Is `w` selling at least as much of `good` as any other shop today? */
function isLeadSeller(world: World, w: Workshop, good: string): boolean {
  for (const other of world.workshops.values()) {
    if (other.id === w.id) continue;
    if (WORKSHOP_DEFS[other.type].output !== good) continue;
    if (other.soldToday > w.soldToday) return false;
  }
  return true;
}

/** An AI owner dies; their shop is vacated so it goes to auction (Last Will). */
function stageLastWillDeath(world: World): void {
  const victim = [...world.workshops.values()].find(
    (w) => !w.bankrupt && world.owners.get(w.ownerId)?.kind !== "player",
  );
  if (!victim) return;
  world.goal!.lastWillWorkshopId = victim.id;
  victim.bankrupt = true;
  victim.workers = [];
  pushFeed(world, "death", `The ${victim.type}'s owner passed away; the shop will go to auction.`, {
    workshop: victim.id,
  });
}

/** Credit a trade toward both owners' "coins traded" total (Merchant Prince). */
export function recordTrade(world: World, sellerId: string, buyerId: string, coins: number): void {
  const goal = world.goal;
  if (!goal) return;
  for (const id of [sellerId, buyerId]) {
    const t = goal.track.get(id);
    if (t) t.coinsTraded += coins;
  }
}
