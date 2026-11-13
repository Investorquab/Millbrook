/**
 * Scoring functions for the 20 goal cards. Each card is one function over the
 * world; competitive cards rank the owners, co-op cards score the whole town,
 * and a few carry a `setup` hook (applied at season start by the SoloSession)
 * or need a `minTownSize`. The running totals some cards score on (coins traded,
 * a lead-seller streak, the day a shop reached full staff) are kept in
 * `world.goal` by goal.ts; here we only read them.
 */

import { WORKSHOP_DEFS } from "./rules.js";
import { initGoal } from "./goal.js";
import type { GoalTrack, World } from "./types.js";

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
  /** Minimum number of workshops this card needs (Supply King, Landlord). */
  minTownSize?: number;
  /** Apply the card's opening setup to a fresh world (SoloSession, day 0). */
  setup?: (world: World) => void;
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

function workshopOf(world: World, ownerId: string) {
  return world.workshops.get(world.owners.get(ownerId)!.workshopId)!;
}

function profit(world: World, ownerId: string): number {
  const w = workshopOf(world, ownerId);
  return world.ledger.get(w.id) - w.startingCoins;
}

function track(world: World, workshopId: string): GoalTrack | undefined {
  return world.goal?.track.get(workshopId);
}

/** Does this owner also own the shop that supplies their workshop's input?
 *  (Supply King — e.g. a baker who also owns the farm's substitute, the mill.) */
function ownsSupplier(world: World, ownerId: string): boolean {
  const w = workshopOf(world, ownerId);
  const input = WORKSHOP_DEFS[w.type].input;
  const mine = new Set(
    [...world.owners.values()].filter((o) => o.id === ownerId).map((o) => o.workshopId),
  );
  for (const other of world.workshops.values()) {
    if (mine.has(other.id) && WORKSHOP_DEFS[other.type].output === input) return true;
  }
  return false;
}

/** The last recorded metric for a given game day (0-indexed), or undefined. */
function metricOnDay(world: World, day: number) {
  return world.metrics.find((m) => m.day === day);
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

  // ── Competitive cards that need a system or a setup ─────────────────────────
  last_shop_standing: {
    id: "last_shop_standing",
    name: "Last Shop Standing",
    kind: "competitive",
    howToWin: "Be the only shop still trading — or the richest when time runs out.",
    scoreOwner: (world, ownerId) => {
      const w = workshopOf(world, ownerId);
      const coins = world.ledger.get(w.id);
      const score = (w.bankrupt ? 0 : 10_000_000) + coins;
      return ownerScore(world, ownerId, score, w.bankrupt ? `Bankrupt — ${coins} coins left.` : `Still trading, ${coins} coins.`);
    },
  },
  monopoly: {
    id: "monopoly",
    name: "Monopoly",
    kind: "competitive",
    howToWin: "Lead the sales of your good for three days running.",
    scoreOwner: (world, ownerId) => {
      const w = workshopOf(world, ownerId);
      const best = track(world, w.id)?.leadStreakBest ?? 0;
      const met = best >= 3;
      return ownerScore(world, ownerId, best, `${best}-day run leading ${WORKSHOP_DEFS[w.type].output} sales${met ? " — monopoly!" : ""}.`);
    },
  },
  merchant_prince: {
    id: "merchant_prince",
    name: "Merchant Prince",
    kind: "competitive",
    howToWin: "Trade the most coins with other owners.",
    scoreOwner: (world, ownerId) => {
      const traded = track(world, workshopOf(world, ownerId).id)?.coinsTraded ?? 0;
      return ownerScore(world, ownerId, traded, `${traded} coins traded with other shops.`);
    },
  },
  underdog: {
    id: "underdog",
    name: "Underdog",
    kind: "competitive",
    howToWin: "Start poor (200 coins to the rivals' 1,000) and gain the most.",
    setup: (world) => initGoal(world, "underdog"),
    scoreOwner: (world, ownerId) => {
      const p = profit(world, ownerId);
      return ownerScore(world, ownerId, p, `Gained ${p >= 0 ? "+" : ""}${p} coins from a lean start.`);
    },
  },
  great_depression: {
    id: "great_depression",
    name: "Great Depression",
    kind: "competitive",
    howToWin: "The town opens at 30% unemployment — be first back to a full crew.",
    setup: (world) => initGoal(world, "great_depression"),
    scoreOwner: (world, ownerId) => {
      const w = workshopOf(world, ownerId);
      const reached = track(world, w.id)?.fullStaffDay ?? null;
      // Reaching full staff earlier beats a bigger-but-later crew.
      const score = reached !== null ? 1_000_000 - reached : w.workers.length;
      const detail = reached !== null ? `Back to a full crew by day ${reached + 1}.` : `${w.workers.length}/${w.maxWorkers} staffed.`;
      return ownerScore(world, ownerId, score, detail);
    },
  },
  supply_king: {
    id: "supply_king",
    name: "Supply King",
    kind: "competitive",
    howToWin: "Own a shop and its supplier, and sell the most of one good.",
    minTownSize: 6,
    scoreOwner: (world, ownerId) => {
      const w = workshopOf(world, ownerId);
      const sold = track(world, w.id)?.soldTotal ?? 0;
      const chained = ownsSupplier(world, ownerId);
      const score = sold * (chained ? 2 : 1);
      return ownerScore(world, ownerId, score, `Sold ${Math.floor(sold)} ${WORKSHOP_DEFS[w.type].output}${chained ? ", and owns the supplier (×2)" : ""}.`);
    },
  },
  landlord: {
    id: "landlord",
    name: "Landlord",
    kind: "competitive",
    howToWin: "Build the town's houses: sell the most house parts by day 28.",
    minTownSize: 8,
    scoreOwner: (world, ownerId) => {
      const w = workshopOf(world, ownerId);
      const parts = w.type === "carpenter" ? Math.floor(track(world, w.id)?.soldTotal ?? 0) : 0;
      return ownerScore(world, ownerId, parts, w.type === "carpenter" ? `Raised the town's housing: ${parts} house parts sold.` : `Not in the building trade.`);
    },
  },
  election_year: {
    id: "election_year",
    name: "Election Year",
    kind: "competitive",
    howToWin: "Hold the town's favour through a season of elections.",
    scoreOwner: (world, ownerId) => {
      const rep = Math.round(world.owners.get(ownerId)!.reputation);
      return ownerScore(world, ownerId, rep, `Standing ${rep >= 0 ? "+" : ""}${rep} as the votes were counted.`);
    },
  },
  last_will: {
    id: "last_will",
    name: "Last Will",
    kind: "competitive",
    howToWin: "An owner dies on day 7 — win her shop at auction and run it best.",
    setup: (world) => initGoal(world, "last_will"),
    scoreOwner: (world, ownerId) => {
      const w = workshopOf(world, ownerId);
      const willId = world.goal?.lastWillWorkshopId;
      const p = profit(world, ownerId);
      const holdsWill = willId !== undefined && w.id === willId;
      // Running the contested shop is the point: its owner competes on profit,
      // with a decisive edge for having taken the inheritance at auction.
      const score = (holdsWill ? 1_000_000 : 0) + p;
      return ownerScore(world, ownerId, score, holdsWill ? `Took the inheritance; profit ${p >= 0 ? "+" : ""}${p}.` : `Profit ${p >= 0 ? "+" : ""}${p}.`);
    },
  },
  ageing_town: {
    id: "ageing_town",
    name: "Ageing Town",
    kind: "competitive",
    howToWin: "Half the town retires early — keep the fullest crew on day 28.",
    setup: (world) => initGoal(world, "ageing_town"),
    scoreOwner: (world, ownerId) => {
      const w = workshopOf(world, ownerId);
      return ownerScore(world, ownerId, w.workers.length, `${w.workers.length}/${w.maxWorkers} staffed despite the retirements.`);
    },
  },

  // ── Co-op cards that need a system or a setup ───────────────────────────────
  public_works: {
    id: "public_works",
    name: "Public Works",
    kind: "coop",
    howToWin: "Fund three public works through taxes, with no shop going bankrupt.",
    scoreTown: (world) => {
      const funded = world.feed.filter((e) => e.kind === "public_works").length;
      const anyBankrupt = [...world.workshops.values()].some((w) => w.bankrupt);
      const met = funded >= 3 && !anyBankrupt;
      return { score: funded, met, detail: `${funded} public works funded${anyBankrupt ? ", but a shop went bankrupt" : ""}.` };
    },
  },
  housing_crisis: {
    id: "housing_crisis",
    name: "Housing Crisis",
    kind: "coop",
    howToWin: "Ten homeless families arrive — house them all by day 21.",
    setup: (world) => initGoal(world, "housing_crisis"),
    scoreTown: (world) => {
      const m = metricOnDay(world, 20) ?? world.metrics.at(-1); // day 21 is index 20
      const homeless = m ? Math.max(0, m.population - m.houses) : 0;
      const housed = m ? Math.min(m.population, m.houses) : 0;
      return { score: housed, met: !!m && homeless === 0, detail: homeless === 0 ? `Everyone housed by day 21.` : `${homeless} still without a home at day 21.` };
    },
  },
  epidemic: {
    id: "epidemic",
    name: "Epidemic",
    kind: "coop",
    howToWin: "An epidemic hits on day 5 — keep the town above 25 residents.",
    setup: (world) => initGoal(world, "epidemic"),
    scoreTown: (world) => {
      const pop = world.metrics.at(-1)?.population ?? 0;
      return { score: pop, met: pop > 25, detail: `${pop} residents came through the epidemic.` };
    },
  },
  hidden_agenda: {
    id: "hidden_agenda",
    name: "Hidden Agenda",
    kind: "secret",
    howToWin: "Everyone keeps a secret goal — do best at yours (profit, for now).",
    scoreOwner: (world, ownerId) => {
      const p = profit(world, ownerId);
      return ownerScore(world, ownerId, p, `Secret goal progress: ${p >= 0 ? "+" : ""}${p} coins.`);
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
