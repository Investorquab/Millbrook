import { describe, expect, it } from "vitest";
import { TOTAL_COINS } from "@millbrook/shared";
import { SoloSession } from "./session.js";
import { GOAL_CARDS, standings } from "./scoring.js";

const SIX = ["bakery", "smithy", "weaver", "tailor", "tavern", "brewery"];
const EIGHT = [...SIX, "apothecary", "carpenter"];

/** A seeded solo season played to day 28 under one goal card. */
function playSeason(cardId: string, seed = 7) {
  const card = GOAL_CARDS[cardId]!;
  const openWorkshops =
    card.minTownSize === 8 ? EIGHT : card.minTownSize === 6 ? SIX : undefined;
  const s = new SoloSession({ seed, days: 28, goalCard: cardId, openWorkshops: openWorkshops as never });
  for (let i = 0; i < 28; i++) {
    s.step();
    s.world.ledger.assertInvariant(TOTAL_COINS); // every card conserves 10,000
  }
  return s;
}

describe("goal cards", () => {
  const ids = Object.keys(GOAL_CARDS);

  it("there are the full 20 cards (plus the extra Steadfast)", () => {
    expect(ids.length).toBeGreaterThanOrEqual(21);
    for (const key of ["tycoon", "town_hero", "last_will", "underdog", "hidden_agenda"]) {
      expect(GOAL_CARDS[key]).toBeTruthy();
    }
  });

  for (const id of Object.keys(GOAL_CARDS)) {
    it(`"${id}" scores a season and names a winner with an explanation`, () => {
      const s = playSeason(id);
      const card = GOAL_CARDS[id]!;

      if (card.scoreOwner) {
        const ranked = standings(s.world, id);
        expect(ranked.length).toBeGreaterThan(0);
        const winner = ranked[0]!;
        expect(winner.ownerName).toBeTruthy();
        expect(winner.detail.length).toBeGreaterThan(0);
        // Best-first ordering.
        expect(winner.score).toBeGreaterThanOrEqual(ranked.at(-1)!.score);
      } else {
        const town = card.scoreTown!(s.world);
        expect(typeof town.met).toBe("boolean");
        expect(town.detail.length).toBeGreaterThan(0);
      }
    });
  }

  it("Underdog starts the player poor and the rivals rich, still totalling 10,000", () => {
    const s = new SoloSession({ seed: 7, days: 28, goalCard: "underdog" });
    const player = s.world.ledger.get(s.playerWorkshopId);
    expect(player).toBe(200);
    for (const w of s.world.workshops.values()) {
      if (w.id !== s.playerWorkshopId) expect(s.world.ledger.get(w.id)).toBe(1000);
    }
    s.world.ledger.assertInvariant(TOTAL_COINS);
  });

  it("Great Depression opens near 30% unemployment", () => {
    const s = new SoloSession({ seed: 7, days: 28, goalCard: "great_depression" });
    const alive = [...s.world.residents.values()].filter((r) => r.alive && !r.retired);
    const jobless = alive.filter((r) => !r.employerId).length;
    expect(jobless / alive.length).toBeGreaterThan(0.25);
  });

  it("Last Will stages a death and puts the shop up for auction", () => {
    const s = playSeason("last_will");
    expect(s.world.goal?.lastWillWorkshopId).toBeTruthy();
    expect(s.world.feed.some((e) => e.kind === "death")).toBe(true);
  });

  it("the Epidemic card hits the town on day 5", () => {
    const s = playSeason("epidemic");
    expect(s.world.feed.some((e) => e.text.toLowerCase().includes("epidemic"))).toBe(true);
  });

  it("Housing Crisis brings extra families the town must house", () => {
    const base = [...new SoloSession({ seed: 7, days: 28 }).world.residents.values()].length;
    const s = new SoloSession({ seed: 7, days: 28, goalCard: "housing_crisis" });
    expect([...s.world.residents.values()].length).toBeGreaterThan(base);
  });

  it("a plain season (no goal card) leaves world.goal undefined — headless-safe", () => {
    const s = new SoloSession({ seed: 7, days: 28 });
    expect(s.world.goal).toBeUndefined();
  });
});
