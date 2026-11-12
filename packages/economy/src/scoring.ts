/**
 * Scoring functions for the goal cards. Each card is one function over the
 * world; competitive cards rank the owners, co-op cards score the whole town.
 * Only the "Core" cards (no extra systems) are implemented in M1; the rest
 * arrive with the systems they need.
 */

import type { World } from "./types.js";

export type GoalCardKind = "competitive" | "coop" | "secret";

export interface OwnerScore {
  ownerId: string;
  ownerName: string;
  workshopType: string;
  score: number;
  detail: string;
}

export interface GoalCard {
  id: string;
  name: string;
  kind: GoalCardKind;
  /** One-line win condition for the UI. */
  howToWin: string;
  /** Score one owner (higher is better). */
  scoreOwner?: (world: World, ownerId: string) => OwnerScore;
  /** Co-op cards return a single town score and whether it is met. */
  scoreTown?: (world: World) => { score: number; met: boolean; detail: string };
}

function ownerScore(world: World, ownerId: string, score: number, detail: string): OwnerScore {
  const owner = world.owners.get(ownerId)!;
  const workshop = world.workshops.get(owner.workshopId)!;
  return { ownerId, ownerName: owner.name, workshopType: workshop.type, score, detail };
}

function profit(world: World, ownerId: string): number {
  const w = world.workshops.get(world.owners.get(ownerId)!.workshopId)!;
  return world.ledger.get(w.id) - w.startingCoins;
}

export const GOAL_CARDS: Record<string, GoalCard> = {
  tycoon: {
    id: "tycoon",
    name: "Tycoon",
    kind: "competitive",
    howToWin: "Most profit at day 28.",
    scoreOwner: (world, ownerId) => {
      const p = profit(world, ownerId);
      return ownerScore(world, ownerId, p, `Profit ${p >= 0 ? "+" : ""}${p} coins.`);
    },
  },
  biggest_employer: {
    id: "biggest_employer",
    name: "Biggest Employer",
    kind: "competitive",
    howToWin: "Most workers on day 28.",
    scoreOwner: (world, ownerId) => {
      const w = world.workshops.get(world.owners.get(ownerId)!.workshopId)!;
      return ownerScore(world, ownerId, w.workers.length, `${w.workers.length} workers.`);
    },
  },
  fair_boss: {
    id: "fair_boss",
    name: "Fair Boss",
    kind: "competitive",
    howToWin: "Highest wage while staying profitable.",
    scoreOwner: (world, ownerId) => {
      const w = world.workshops.get(world.owners.get(ownerId)!.workshopId)!;
      const prof = profit(world, ownerId);
      const score = prof >= 0 ? w.wage : -1;
      return ownerScore(world, ownerId, score, prof >= 0 ? `Wage ${w.wage}, profitable.` : `Unprofitable — disqualified.`);
    },
  },
  speedrun: {
    id: "speedrun",
    name: "Speedrun",
    kind: "competitive",
    howToWin: "First to 5,000 coins.",
    scoreOwner: (world, ownerId) => {
      const w = world.workshops.get(world.owners.get(ownerId)!.workshopId)!;
      const coins = world.ledger.get(w.id);
      return ownerScore(world, ownerId, coins, `${coins} coins${coins >= 5000 ? " — reached 5,000!" : ""}.`);
    },
  },
  steadfast: {
    id: "steadfast",
    name: "Steadfast",
    kind: "competitive",
    howToWin: "Highest standing with the town on day 28.",
    scoreOwner: (world, ownerId) => {
      const rep = Math.round(world.owners.get(ownerId)!.reputation);
      return ownerScore(world, ownerId, rep, `Reputation ${rep >= 0 ? "+" : ""}${rep}.`);
    },
  },
  town_hero: {
    id: "town_hero",
    name: "Town Hero",
    kind: "coop",
    howToWin: "Keep unemployment under 10% every day.",
    scoreTown: (world) => {
      const daysUnder = world.metrics.filter((m) => m.unemployment < 0.1).length;
      const met = world.metrics.length > 0 && daysUnder === world.metrics.length;
      return { score: daysUnder, met, detail: `${daysUnder}/${world.metrics.length} days under 10% unemployment.` };
    },
  },
  boomtown: {
    id: "boomtown",
    name: "Boomtown",
    kind: "coop",
    howToWin: "Grow the town to 60 residents.",
    scoreTown: (world) => {
      const pop = world.metrics.at(-1)?.population ?? 0;
      return { score: pop, met: pop >= 60, detail: `${pop} residents.` };
    },
  },
};

/** Rank the owners for a competitive card, best first. */
export function standings(world: World, cardId: string): OwnerScore[] {
  const card = GOAL_CARDS[cardId];
  if (!card?.scoreOwner) return [];
  const scoreOwner = card.scoreOwner;
  return [...world.owners.keys()]
    .map((id) => scoreOwner(world, id))
    .sort((a, b) => b.score - a.score);
}
