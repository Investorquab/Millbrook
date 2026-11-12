import { describe, expect, it } from "vitest";
import { TOTAL_COINS } from "@millbrook/shared";
import { createWorld } from "./state.js";
import { runTheft, THEFT_RATE, GUARD_WAGE } from "./theft.js";
import { unemploymentRate } from "./rules.js";

function world(theft: boolean) {
  return createWorld({ seed: 42, days: 28, theft });
}

/** Lay everyone off so the town is well above the theft threshold. */
function makeStruggle(w: ReturnType<typeof world>) {
  for (const r of w.residents.values()) r.employerId = null;
}

describe("theft", () => {
  it("is off by default: stock is untouched even when the town struggles", () => {
    const w = world(false);
    makeStruggle(w);
    const shop = [...w.workshops.values()][0]!;
    shop.outputStock = 100;
    runTheft(w);
    expect(shop.outputStock).toBe(100);
    expect(w.feed.some((e) => e.kind === "theft")).toBe(false);
  });

  it("does nothing while unemployment is low", () => {
    const w = world(true);
    // Fresh world (no layoffs): everyone is employed-or-none but unemployment is
    // computed over the labour force; force it low by employing everyone.
    const shop = [...w.workshops.values()][0]!;
    for (const r of w.residents.values()) r.employerId = shop.id;
    shop.outputStock = 100;
    expect(unemploymentRate(w)).toBeLessThanOrEqual(0.2);
    runTheft(w);
    expect(shop.outputStock).toBe(100);
  });

  it("loses goods (never coins) when unemployment is high", () => {
    const w = world(true);
    makeStruggle(w);
    expect(unemploymentRate(w)).toBeGreaterThan(0.2);
    const shop = [...w.workshops.values()][0]!;
    shop.outputStock = 100;
    const coinsBefore = w.ledger.total();

    runTheft(w);

    expect(shop.outputStock).toBe(100 - Math.floor(100 * THEFT_RATE));
    expect(w.feed.some((e) => e.kind === "theft")).toBe(true);
    // Coins are never touched — the invariant holds.
    expect(w.ledger.total()).toBe(coinsBefore);
    w.ledger.assertInvariant(TOTAL_COINS);
  });

  it("a guarded shop pays the watch and keeps its stock, conserving the total", () => {
    const w = world(true);
    makeStruggle(w);
    const shop = [...w.workshops.values()][0]!;
    shop.outputStock = 100;
    shop.guarded = true;
    const shopBefore = w.ledger.get(shop.id);
    const totalBefore = w.ledger.total();

    runTheft(w);

    expect(shop.outputStock).toBe(100); // stock spared
    expect(w.ledger.get(shop.id)).toBe(shopBefore - GUARD_WAGE); // paid the watch
    expect(w.ledger.total()).toBe(totalBefore); // coins stayed in town
    w.ledger.assertInvariant(TOTAL_COINS);
  });
});
