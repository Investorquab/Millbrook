import { describe, expect, it } from "vitest";
import { TOTAL_COINS, TOWN_HALL_ID } from "@millbrook/shared";
import { createWorld } from "./state.js";
import { stepDay } from "./engine.js";
import { runAuctions, AUCTION_COOLDOWN_DAYS, AUCTION_STAKE } from "./auction.js";
import { createSoloSession } from "./session.js";

function world(auctions: boolean, seed = 42) {
  return createWorld({ seed, days: 28, auctions });
}

/** Force a non-player workshop into bankruptcy, as the dusk step would. */
function bankruptFirstShop(w: ReturnType<typeof world>) {
  const shop = [...w.workshops.values()][0]!;
  shop.bankrupt = true;
  shop.daysBankrupt = 0;
  for (const rid of shop.workers) {
    const r = w.residents.get(rid);
    if (r) r.employerId = null;
  }
  shop.workers = [];
  return shop;
}

describe("bankruptcy auctions", () => {
  it("is off by default: a bankrupt shop stays shuttered", () => {
    const w = world(false);
    const shop = bankruptFirstShop(w);
    for (let i = 0; i < 10; i++) runAuctions(w);
    expect(shop.bankrupt).toBe(true);
    expect(shop.auctions).toBe(0);
  });

  it("re-lets the premises after the cooldown, conserving the 10,000 total", () => {
    const w = world(true);
    const shop = bankruptFirstShop(w);
    const estate = w.ledger.get(shop.id);
    const hallBefore = w.ledger.get(TOWN_HALL_ID);
    const oldOwnerName = w.owners.get(shop.ownerId)!.name;

    // Days 1…cooldown-1: still shuttered.
    for (let i = 0; i < AUCTION_COOLDOWN_DAYS - 1; i++) {
      runAuctions(w);
      expect(shop.bankrupt).toBe(true);
    }
    // The cooldown day: re-let.
    runAuctions(w);

    expect(shop.bankrupt).toBe(false);
    expect(shop.auctions).toBe(1);
    // A new owner took over, still an AI, reputation reset.
    const owner = w.owners.get(shop.ownerId)!;
    expect(owner.kind).toBe("ai");
    expect(owner.name).not.toBe(oldOwnerName);
    expect(owner.reputation).toBe(0);
    // The estate was swept to the Town Hall, which staked the revived shop.
    const stake = Math.min(AUCTION_STAKE, hallBefore + estate);
    expect(w.ledger.get(shop.id)).toBe(stake);
    expect(w.ledger.get(TOWN_HALL_ID)).toBe(hallBefore + estate - stake);
    w.ledger.assertInvariant(TOTAL_COINS);
    // Reopened fresh, ready to trade.
    expect(shop.outputStock).toBe(0);
    expect(shop.workers).toHaveLength(0);
    expect(w.feed.some((e) => e.kind === "auction")).toBe(true);
  });

  it("never auctions a shop the player runs", () => {
    const s = createSoloSession(42);
    const bakery = s.world.workshops.get(s.playerWorkshopId)!;
    bakery.bankrupt = true;
    bakery.daysBankrupt = 0;
    for (let i = 0; i < 10; i++) runAuctions(s.world);
    expect(bakery.bankrupt).toBe(true); // still the player's, still shuttered
    expect(bakery.auctions).toBe(0);
    expect(s.world.owners.get(bakery.ownerId)!.kind).toBe("player");
  });

  it("is deterministic: same seed re-lets to the same new owner", () => {
    const a = world(true, 7);
    const b = world(true, 7);
    const sa = bankruptFirstShop(a);
    const sb = bankruptFirstShop(b);
    for (let i = 0; i < AUCTION_COOLDOWN_DAYS; i++) {
      runAuctions(a);
      runAuctions(b);
    }
    const oa = a.owners.get(sa.ownerId)!;
    const ob = b.owners.get(sb.ownerId)!;
    expect(oa.name).toBe(ob.name);
    expect(oa.strategy).toBe(ob.strategy);
  });

  it("keeps the invariant across full seasons with auctions on", () => {
    let auctionsFired = 0;
    for (const seed of [1, 2, 3, 4, 7, 13, 21, 42, 100, 200]) {
      const w = world(true, seed);
      for (let i = 0; i < 28; i++) {
        stepDay(w);
        w.ledger.assertInvariant(TOTAL_COINS);
      }
      auctionsFired += [...w.workshops.values()].reduce((n, s) => n + s.auctions, 0);
    }
    // The auction path actually runs in real seasons (shops do fail and re-let).
    expect(auctionsFired).toBeGreaterThan(0);
  });
});
