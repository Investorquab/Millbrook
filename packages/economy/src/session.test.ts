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

  it("builds a metrics series aligned with the days played", () => {
    const s = createSoloSession(42);
    for (let d = 0; d < 6; d++) s.step();
    const m = s.metricsSeries();
    expect(m.days.length).toBe(6);
    expect(m.unemployment.length).toBe(6);
    expect(m.avgWage.length).toBe(6);
    expect(m.residentShare.length).toBe(6);
    // Days are 1-indexed and strictly increasing.
    expect(m.days[0]).toBe(1);
    expect(m.minDay).toBe(1);
    expect(m.maxDay).toBe(6);
    // Residents' share is a sane percentage of the fixed supply.
    for (const pct of m.residentShare) {
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });

  it("ranks the player among the AI owners and marks exactly one 'you' row", () => {
    const s = createSoloSession(42);
    s.hire();
    for (let d = 0; d < 28; d++) s.step();
    const rows = s.standings();
    expect(rows.length).toBeGreaterThanOrEqual(3);
    // Ranks are 1..n with no gaps, best first.
    expect(rows.map((r) => r.rank)).toEqual(rows.map((_, i) => i + 1));
    expect(rows.filter((r) => r.isPlayer).length).toBe(1);
    // Scores are sorted descending.
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1]!.score).toBeGreaterThanOrEqual(rows[i]!.score);
    const summary = s.seasonSummary();
    expect(summary.coins).toBe(TOTAL_COINS);
    expect(summary.playerRank).toBeGreaterThanOrEqual(1);
    expect(summary.playerRank).toBeLessThanOrEqual(rows.length);
    expect(summary.headline.startsWith("You finished")).toBe(true);
    expect(summary.goal.name.length).toBeGreaterThan(0);
  });

  it("the goal card can be switched and drives the standings order", () => {
    const s = createSoloSession(7);
    s.setGoalCard("biggest_employer");
    for (let d = 0; d < 20; d++) s.step();
    expect(s.goalCard().id).toBe("biggest_employer");
    const rows = s.standings();
    // Top row has the most workers under this card.
    const maxWorkers = Math.max(...rows.map((r) => r.workers));
    expect(rows[0]!.workers).toBe(maxWorkers);
  });

  it("writes a Gazette from the week's real events, with a price table", () => {
    const s = createSoloSession(42);
    for (let d = 0; d < 9; d++) s.step();
    const g = s.gazette();
    expect(g.week).toBeGreaterThanOrEqual(1);
    expect(g.dateline).toContain("day");
    expect(g.lead.heading.length).toBeGreaterThan(0);
    expect(g.lead.paragraphs.length).toBeGreaterThan(0);
    expect(g.prices.length).toBe(5);
    // After a week of play, "last week" prices are populated (not the first day).
    expect(g.prices.some((p) => p.lastWeek !== null)).toBe(true);
    expect(g.comingsAndGoings.length).toBeGreaterThan(0);
    expect(g.notice.length).toBeGreaterThan(0);
  });

  it("is deterministic for the review screens too (same seed → same summary)", () => {
    const run = () => {
      const s = createSoloSession(11);
      s.hire();
      for (let d = 0; d < 28; d++) s.step();
      const sum = s.seasonSummary();
      return { rank: sum.playerRank, coins: sum.coins, headline: sum.headline, note: sum.townNote };
    };
    expect(run()).toEqual(run());
  });

  describe("reputation", () => {
    it("starts at neutral and rises for a consistently high-paying player", () => {
      const s = createSoloSession(42);
      expect(s.view().reputation).toBe(0);
      s.hire();
      s.setWage(12); // well above the town average
      for (let d = 0; d < 20; d++) s.step();
      const v = s.view();
      expect(v.reputation).toBeGreaterThan(15);
      expect(v.reputationLabel).toMatch(/Fair|Well liked/);
    });

    it("falls for a player who pays rock-bottom wages", () => {
      const s = createSoloSession(42);
      s.hire();
      s.setWage(5); // the floor, below the town average
      for (let d = 0; d < 20; d++) s.step();
      expect(s.view().reputation).toBeLessThan(0);
    });

    it("gives each owner a reputation in the final standings (not all zero)", () => {
      const s = createSoloSession(7);
      s.hire();
      s.setWage(11);
      for (let d = 0; d < 28; d++) s.step();
      const rows = s.standings();
      expect(rows.every((r) => Number.isFinite(r.reputation))).toBe(true);
      // The season moved reputations off zero for at least some owners.
      expect(rows.some((r) => r.reputation !== 0)).toBe(true);
    });

    it("is deterministic (same seed + actions → same reputations)", () => {
      const run = () => {
        const s = createSoloSession(3);
        s.hire();
        s.setWage(10);
        for (let d = 0; d < 14; d++) s.step();
        return s.standings().map((r) => r.reputation);
      };
      expect(run()).toEqual(run());
    });
  });

  describe("claiming shops (multiplayer rooms)", () => {
    it("lists four open shops, only the bakery claimed at the start", () => {
      const s = createSoloSession(42);
      const slots = s.workshopSlots();
      expect(slots.map((x) => x.type).sort()).toEqual(["bakery", "brewery", "smithy", "weaver"]);
      expect(slots.filter((x) => x.claimed).map((x) => x.type)).toEqual(["bakery"]);
    });

    it("claims a second shop: its owner becomes player-controlled, and claim is idempotent", () => {
      const s = createSoloSession(42);
      const id = s.claim("weaver");
      expect(id).not.toBeNull();
      const w = s.world.workshops.get(id!)!;
      const owner = s.world.owners.get(w.ownerId)!;
      expect(owner.kind).toBe("player");
      expect(owner.strategy).toBeNull();
      // Already claimed → a second claim of the same type is refused.
      expect(s.claim("weaver")).toBeNull();
      // Price/wage land inside the stepper bounds so the UI is valid.
      expect(w.price).toBeGreaterThanOrEqual(1);
      expect(w.price).toBeLessThanOrEqual(PRICE_MAX);
    });

    it("the AI never overrides a claimed shop's price across a day", () => {
      const s = createSoloSession(7);
      const id = s.claim("smithy")!;
      s.setPrice(5, id);
      s.setWage(10, id);
      s.step();
      const v = s.view(id);
      expect(v.workshopType).toBe("smithy");
      expect(v.price).toBe(5);
      expect(v.wage).toBe(10);
    });

    it("gives each claimed shop its own view, coins and day-delta", () => {
      const s = createSoloSession(42);
      const weaverId = s.claim("weaver")!;
      s.hire(); // into the bakery
      s.hire(weaverId); // into the weaver
      s.setPrice(3);
      s.setPrice(4, weaverId);
      for (let d = 0; d < 6; d++) s.step();
      const bakery = s.view();
      const weaver = s.view(weaverId);
      expect(bakery.workshopType).toBe("bakery");
      expect(weaver.workshopType).toBe("weaver");
      // Two different shops, two different coin positions.
      expect(bakery.coins).not.toBe(weaver.coins);
      s.world.ledger.assertInvariant(TOTAL_COINS);
    });

    it("releasing a claimed shop restores its AI strategy", () => {
      const s = createSoloSession(5);
      const id = s.claim("brewery")!;
      const owner = s.world.owners.get(s.world.workshops.get(id)!.ownerId)!;
      expect(owner.strategy).toBeNull();
      s.release(id);
      expect(owner.kind).toBe("ai");
      expect(owner.strategy).not.toBeNull();
      expect(s.isClaimed(id)).toBe(false);
    });

    it("never releases the primary bakery", () => {
      const s = createSoloSession(5);
      s.release(s.playerWorkshopId);
      expect(s.isClaimed(s.playerWorkshopId)).toBe(true);
    });
  });
});
