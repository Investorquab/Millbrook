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

describe("player bidding at auction", () => {
  function sessionWithBankruptRival() {
    const s = createSoloSession(42);
    const rival = [...s.world.workshops.values()].find((w) => w.id !== s.playerWorkshopId)!;
    rival.bankrupt = true;
    rival.daysBankrupt = 0;
    rival.workers = [];
    // Advance the auction clock; with a human in town it opens for a bid, not an AI re-let.
    for (let i = 0; i < AUCTION_COOLDOWN_DAYS; i++) runAuctions(s.world);
    return { s, rival };
  }

  it("puts a failed rival up for auction instead of auto-reletting", () => {
    const { s, rival } = sessionWithBankruptRival();
    expect(rival.upForAuction).toBe(true);
    expect(rival.bankrupt).toBe(true);
    expect(s.auctionOffers().map((o) => o.workshopId)).toContain(rival.id);
  });

  it("lets the player win the premises, conserving the total", () => {
    const { s, rival } = sessionWithBankruptRival();
    const purseBefore = s.world.ledger.get(s.playerWorkshopId);
    expect(s.auctionOffers().find((o) => o.workshopId === rival.id)!.affordable).toBe(true);

    expect(s.takeOverAtAuction(rival.id)).toBe(true);
    expect(rival.bankrupt).toBe(false);
    expect(rival.upForAuction).toBe(false);
    expect(s.isClaimed(rival.id)).toBe(true);
    expect(s.world.owners.get(rival.ownerId)!.kind).toBe("player");
    // The player staked the bid from their own purse; the premises hold it now.
    expect(s.world.ledger.get(s.playerWorkshopId)).toBe(purseBefore - AUCTION_STAKE);
    expect(s.world.ledger.get(rival.id)).toBe(AUCTION_STAKE);
    s.world.ledger.assertInvariant(TOTAL_COINS);
  });

  it("lets the player pass, and an AI takes the premises", () => {
    const { s, rival } = sessionWithBankruptRival();
    s.passAtAuction(rival.id);
    expect(rival.bankrupt).toBe(false);
    expect(rival.upForAuction).toBe(false);
    expect(s.world.owners.get(rival.ownerId)!.kind).toBe("ai");
    expect(s.isClaimed(rival.id)).toBe(false);
    s.world.ledger.assertInvariant(TOTAL_COINS);
  });

  it("an AI owner retires once a season, putting a shop up for auction", () => {
    const s = createSoloSession(42);
    let sawOffer = false;
    for (let i = 0; i < 28; i++) {
      s.step();
      if (s.auctionOffers().length > 0) sawOffer = true;
      s.world.ledger.assertInvariant(TOTAL_COINS);
    }
    const retires = s.world.feed.filter((e) => e.kind === "retire" && e.data?.workshop);
    expect(retires.length).toBe(1); // exactly one owner-retirement beat
    expect(sawOffer).toBe(true); // the player got a chance to bid
  });

  it("blocks a bid the player can't afford", () => {
    const { s, rival } = sessionWithBankruptRival();
    const bakery = s.playerWorkshopId;
    const bal = s.world.ledger.get(bakery);
    const leave = AUCTION_STAKE - 1;
    if (bal > leave) s.world.ledger.transfer(bakery, TOWN_HALL_ID, bal - leave);
    expect(s.auctionOffers().find((o) => o.workshopId === rival.id)!.affordable).toBe(false);
    expect(s.takeOverAtAuction(rival.id)).toBe(false);
    expect(rival.upForAuction).toBe(true); // still open to bid later
    s.world.ledger.assertInvariant(TOTAL_COINS);
  });
});
