/**
 * Bankruptcy auctions — the premises of a failed workshop don't sit empty.
 *
 * Opt-in via `config.auctions`, so headless sims and determinism tests are
 * untouched; the solo game and rooms turn it on. A workshop that has been
 * bankrupt for a couple of days is re-let by the Town Hall: whatever the failed
 * shop still holds is swept to the Town Hall (its workers were already paid what
 * it could afford at dusk), a new owner takes over the premises, and the Town
 * Hall stakes them a little working capital so the shop reopens and the town's
 * trade keeps churning. Every coin stays in town, so the 10,000-coin total holds.
 *
 * A workshop the human runs is never auctioned away from them — bankruptcy there
 * is theirs to feel, not to lose to an AI mid-game.
 */

import { TOWN_HALL_ID } from "@millbrook/shared";
import type { AiStrategyId, Workshop, World } from "./types.js";
import { WORKSHOP_DEFS, BASE_WAGE } from "./rules.js";
import { pushFeed } from "./engine.js";

/** Days a shop stays shuttered before the premises are re-let at auction. */
export const AUCTION_COOLDOWN_DAYS = 2;
/** Working capital the Town Hall stakes a revived shop (capped by its treasury). */
export const AUCTION_STAKE = 120;
/**
 * Extra days the premises stay open to a human's bid after the cooldown, before
 * an AI takes them. The solo game surfaces the offer the moment the cooldown is
 * reached and keeps it standing through this window; past it, an AI re-lets.
 */
export const AUCTION_BID_WINDOW_DAYS = 5;

/** Fresh entrepreneurs who take on a failed shop. */
const NEW_OWNER_NAMES = ["Nia", "Bram", "Opal", "Cass", "Dove", "Reed", "Wren", "Idris"];
const STRATEGIES: AiStrategyId[] = ["gus", "fern", "sam", "rita"];

/**
 * Advance the bankruptcy clock and re-let any premises past the cooldown. Called
 * from {@link endOfDay} after the day has advanced and before the invariant
 * check, so the auction's transfers are covered by it.
 *
 * In a town with a human owner the shop is first put *up for auction* and held
 * so the player can bid (the solo driver surfaces the offer); only after the bid
 * window lapses does an AI re-let it. In a pure-AI town there is no one to bid,
 * so the AI re-lets the moment the cooldown is reached.
 */
export function runAuctions(world: World): void {
  if (!world.config.auctions) return;
  const hasHumanBidder = [...world.owners.values()].some((o) => o.kind === "player");
  for (const w of world.workshops.values()) {
    if (!w.bankrupt) continue;
    // A shop the player runs is never auctioned out from under them.
    if (world.owners.get(w.ownerId)?.kind === "player") continue;
    w.daysBankrupt += 1;
    if (w.daysBankrupt < AUCTION_COOLDOWN_DAYS) continue;

    if (hasHumanBidder && w.daysBankrupt < AUCTION_COOLDOWN_DAYS + AUCTION_BID_WINDOW_DAYS) {
      // Open to a human bid; announce it once.
      if (!w.upForAuction) {
        w.upForAuction = true;
        pushFeed(world, "auction", `The ${w.type} is up for auction.`, { workshop: w.id });
      }
      continue;
    }
    // No human bidder, or the window lapsed: an AI re-lets the premises.
    reletToAi(world, w);
  }
}

/** An AI entrepreneur takes over: a new owner reopens the premises. */
export function reletToAi(world: World, w: Workshop): void {
  // Settle the estate to the Town Hall, then the Town Hall stakes the premises.
  const estate = world.ledger.get(w.id);
  if (estate > 0) world.ledger.transfer(w.id, TOWN_HALL_ID, estate);
  const stake = world.ledger.payUpTo(TOWN_HALL_ID, w.id, AUCTION_STAKE);

  // A new owner takes over — reusing the owner slot keeps the 1:1 wiring.
  const owner = world.owners.get(w.ownerId);
  const newName = NEW_OWNER_NAMES[world.rng.int(0, NEW_OWNER_NAMES.length - 1)]!;
  const strategy = STRATEGIES[world.rng.int(0, STRATEGIES.length - 1)]!;
  if (owner) {
    owner.name = newName;
    owner.strategy = strategy;
    owner.kind = "ai";
    owner.reputation = 0;
  }

  freshenPremises(w);
  pushFeed(
    world,
    "auction",
    `The ${w.type} was auctioned; ${newName} reopened it with ${stake} coins staked by the Town Hall.`,
    { workshop: w.id, stake, owner: newName },
  );
}

/**
 * Reset a bankrupt workshop to a clean, open, empty state ready to trade again.
 * Does not touch the ledger or the owner — callers settle the money and ownership
 * (the AI path and the player-takeover path differ there).
 */
export function freshenPremises(w: Workshop): void {
  const def = WORKSHOP_DEFS[w.type];
  w.bankrupt = false;
  w.daysBankrupt = 0;
  w.upForAuction = false;
  w.daysShortOnWages = 0;
  w.daysUnderpaid = 0;
  w.strikeDays = 0;
  w.workers = [];
  w.outputStock = 0;
  w.inputStock = {};
  w.tools = 0;
  w.price = def.defaultPrice;
  w.wage = BASE_WAGE;
  w.soldToday = 0;
  w.producedToday = 0;
  w.revenueToday = 0;
  w.soldYesterday = 0;
  w.producedYesterday = 0;
  w.auctions += 1;
}
