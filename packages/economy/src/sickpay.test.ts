import { describe, expect, it } from "vitest";
import { TOTAL_COINS } from "@millbrook/shared";
import { createWorld } from "./state.js";
import { stepDay } from "./engine.js";
import type { World } from "./types.js";

/** A world with staffed shops and no GM, so we control the epidemic ourselves. */
function staffedWorld(seed: number): World {
  const w = createWorld({ seed, days: 28, gameMaster: false });
  for (let i = 0; i < 8; i++) stepDay(w);
  return w;
}

function pushEpidemic(w: World) {
  w.gm.active.push({ id: "epidemic", remainingDays: 3, params: { outputMultiplier: 0.6 } });
}

function firstStaffedShopId(w: World): string {
  return [...w.workshops.values()].find((s) => s.workers.length > 0 && !s.bankrupt)!.id;
}

describe("sick pay during an epidemic", () => {
  it("paying sick pay leaves an owner with better standing than docking does", () => {
    // Two identical towns that differ only in the sick-pay choice at one shop.
    const paid = staffedWorld(42);
    const docked = staffedWorld(42);
    const shopId = firstStaffedShopId(paid);

    paid.workshops.get(shopId)!.sickPay = true;
    docked.workshops.get(shopId)!.sickPay = false;
    pushEpidemic(paid);
    pushEpidemic(docked);
    stepDay(paid);
    stepDay(docked);

    const ownerId = paid.workshops.get(shopId)!.ownerId;
    expect(paid.owners.get(ownerId)!.reputation).toBeGreaterThan(docked.owners.get(ownerId)!.reputation);
    paid.ledger.assertInvariant(TOTAL_COINS);
    docked.ledger.assertInvariant(TOTAL_COINS);
  });

  it("docking pays workers less, leaving more coins in the shop's till", () => {
    const paid = staffedWorld(42);
    const docked = staffedWorld(42);
    const shopId = firstStaffedShopId(paid);
    docked.workshops.get(shopId)!.sickPay = false;
    pushEpidemic(paid);
    pushEpidemic(docked);
    stepDay(paid);
    stepDay(docked);

    // Docking keeps more coins in the till (paid out less in wages).
    expect(docked.ledger.get(shopId)).toBeGreaterThanOrEqual(paid.ledger.get(shopId));
    docked.ledger.assertInvariant(TOTAL_COINS);
  });
});
