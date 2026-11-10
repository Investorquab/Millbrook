import { describe, expect, it } from "vitest";
import { TOTAL_COINS } from "@millbrook/shared";
import { SoloSession, createSoloSession, PRICE_MAX, WAGE_MIN } from "./session.js";

describe("SoloSession", () => {
  it("starts the player on the bakery at the design defaults", () => {
    const s = createSoloSession(42);
    const v = s.view();
    expect(v.workshopType).toBe("bakery");
    expect(v.price).toBe(3);
    expect(v.wage).toBe(8);
    expect(v.day).toBe(1);
    expect(v.totalDays).toBe(28);
    expect(v.ended).toBe(false);
    // The player's owner is not AI-driven.
    const owner = s.world.owners.get(s.world.workshops.get(s.playerWorkshopId)!.ownerId)!;
    expect(owner.kind).toBe("player");
    expect(owner.strategy).toBeNull();
  });

  it("keeps the player's price and wage across a day (the AI never overrides them)", () => {
    const s = createSoloSession(7);
    s.setPrice(5);
    s.setWage(10);
    s.step();
    const v = s.view();
    expect(v.price).toBe(5);
    expect(v.wage).toBe(10);
  });

  it("clamps price and wage to the stepper bounds", () => {
    const s = createSoloSession(1);
    s.setPrice(99);
    s.setWage(0);
    const v = s.view();
    expect(v.price).toBe(PRICE_MAX);
    expect(v.wage).toBe(WAGE_MIN);
  });

  it("hires an idle resident into the bakery and records it in the feed", () => {
    const s = createSoloSession(3);
    const before = s.view().workers.length;
    const hired = s.hire();
    const v = s.view();
    expect(hired).toBe(true);
    expect(v.workers.length).toBe(before + 1);
    expect(v.feed[0]?.text).toContain("hired");
  });

  it("produces and sells bread within a few days of hiring (a sale appears)", () => {
    const s = createSoloSession(42);
    s.hire();
    s.setPrice(3);
    s.setWage(8);
    let sawSale = false;
    for (let d = 0; d < 5; d++) {
      s.step();
      if (s.view().soldToday > 0) sawSale = true;
    }
    expect(sawSale).toBe(true);
  });

  it("holds the 10,000-coin invariant every day of a driven season", () => {
    const s = createSoloSession(99);
    for (let d = 0; d < 28; d++) {
      if (d % 4 === 0) s.hire();
      s.setPrice(2 + (d % 4));
      s.step();
      s.world.ledger.assertInvariant(TOTAL_COINS);
    }
    expect(s.view().ended).toBe(true);
  });

  it("is deterministic: same seed and actions give the same coins and feed", () => {
    const run = () => {
      const s = new SoloSession({ seed: 5, days: 14 });
      for (let d = 0; d < 14; d++) {
        if (d === 0) s.hire();
        s.setPrice(3);
        s.setWage(9);
        s.step();
      }
      const v = s.view();
      return { coins: v.coins, feedLen: s.world.feed.length, lastFeed: v.feed[0]?.text };
    };
    expect(run()).toEqual(run());
  });

  it("holdings always split the full 10,000-coin supply", () => {
    const s = createSoloSession(42);
    for (let d = 0; d < 10; d++) {
      const h = s.holdings();
      expect(h.residents + h.workshops + h.coop + h.townHall).toBe(TOTAL_COINS);
      expect(h.total).toBe(TOTAL_COINS);
      s.step();
    }
  });

  it("builds a resident card with a real reason and employer", () => {
    const s = createSoloSession(42);
    s.hire();
    s.step();
    const card = s.residentCard();
    expect(card).not.toBeNull();
    expect(card!.name.length).toBeGreaterThan(0);
    expect(card!.traitLabel.length).toBeGreaterThan(0);
    expect(card!.currentReason.length).toBeGreaterThan(0);
    expect(card!.needs.length).toBe(3);
  });

  it("stops stepping once the season has ended", () => {
    const s = new SoloSession({ seed: 2, days: 3 });
    for (let d = 0; d < 10; d++) s.step();
    const v = s.view();
    expect(v.ended).toBe(true);
    expect(v.day).toBe(3);
  });
});
