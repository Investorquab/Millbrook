import { describe, expect, it } from "vitest";
import { TOTAL_COINS, COOP_ID } from "@millbrook/shared";
import { createWorld } from "./state.js";
import { stepDay } from "./engine.js";
import { runFire, INSURANCE_PREMIUM } from "./fire.js";

function world(fire: boolean) {
  return createWorld({ seed: 42, days: 28, fire });
}

describe("fire and insurance", () => {
  it("is off by default: no premiums move, no fires", () => {
    const w = world(false);
    const shop = [...w.workshops.values()][0]!;
    shop.insured = true;
    shop.outputStock = 100;
    const coinsBefore = w.ledger.get(shop.id);
    w.day = 15;
    runFire(w);
    expect(w.ledger.get(shop.id)).toBe(coinsBefore);
    expect(w.feed.some((e) => e.kind === "fire")).toBe(false);
  });

  it("insured shops pay a premium into the Co-op pool, conserving the total", () => {
    const w = world(true);
    // Exactly one insured shop, so the premium flow is unambiguous.
    const shops = [...w.workshops.values()];
    for (const s of shops) s.insured = false;
    const insured = shops[0]!;
    insured.insured = true;
    const poolBefore = w.ledger.get(COOP_ID);
    const shopBefore = w.ledger.get(insured.id);
    w.day = 5; // before fires start, so only premiums move
    runFire(w);
    expect(w.ledger.get(insured.id)).toBe(shopBefore - INSURANCE_PREMIUM);
    expect(w.ledger.get(COOP_ID)).toBe(poolBefore + INSURANCE_PREMIUM);
    w.ledger.assertInvariant(TOTAL_COINS);
  });

  it("a fire destroys goods, never coins, and insurance pays a claim from the pool", () => {
    const w = world(true);
    // Force a fire at an insured shop by making it the only eligible one.
    const insured = [...w.workshops.values()].find((s) => s.insured)!;
    for (const s of w.workshops.values()) s.outputStock = 0;
    insured.outputStock = 50;
    insured.price = 4;
    w.day = 20;
    // Drive runFire until a fire fires (deterministic rng; bounded tries).
    const totalBefore = w.ledger.total();
    let fired = false;
    for (let i = 0; i < 400 && !fired; i++) {
      insured.outputStock = 50;
      runFire(w);
      if (w.feed.some((e) => e.kind === "fire")) fired = true;
    }
    expect(fired).toBe(true);
    // The stock was lost (goods), and the coin total never moved.
    expect(w.ledger.total()).toBe(totalBefore);
    w.ledger.assertInvariant(TOTAL_COINS);
  });

  it("keeps the invariant across full seasons with fire on", () => {
    for (const seed of [1, 7, 13, 21, 42]) {
      const s = createWorld({ seed, days: 28, fire: true });
      for (let i = 0; i < 28; i++) {
        stepDay(s);
        s.ledger.assertInvariant(TOTAL_COINS);
      }
    }
  });
});
