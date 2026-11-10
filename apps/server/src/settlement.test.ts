import { describe, it, expect } from "vitest";
import { TOTAL_COINS } from "@millbrook/shared";
import { createSoloSession } from "@millbrook/economy";
import { diffToTransfers, applyTransfers, totalOf, type Balances } from "./settlement.js";

describe("settlement diff", () => {
  it("produces transfers that carry before → after exactly", () => {
    const before: Balances = { r0: 100, w0: 4000, coop: 3200, townhall: 2700 };
    const after: Balances = { r0: 108, w0: 3980, coop: 3200, townhall: 2712 };
    const transfers = diffToTransfers(before, after);
    expect(applyTransfers(before, transfers)).toEqual(after);
  });

  it("refuses to settle a batch that would change the total", () => {
    const before: Balances = { a: 100, b: 100 };
    const after: Balances = { a: 100, b: 101 };
    expect(() => diffToTransfers(before, after)).toThrow(/conserve/);
  });

  it("is a no-op when nothing moved", () => {
    const snap: Balances = { a: 50, b: 50 };
    expect(diffToTransfers(snap, snap)).toEqual([]);
  });

  it("every transfer is positive and conserves the total", () => {
    const before: Balances = { a: 10, b: 20, c: 30, d: 40 };
    const after: Balances = { a: 0, b: 35, c: 25, d: 40 };
    const transfers = diffToTransfers(before, after);
    for (const t of transfers) {
      expect(t.amount).toBeGreaterThan(0);
      expect(t.from).not.toBe(t.to);
    }
    expect(totalOf(applyTransfers(before, transfers))).toBe(totalOf(before));
  });

  it("settles a real game day from the simulation and conserves 10,000", () => {
    const s = createSoloSession(42);
    let last = s.world.ledger.snapshot();
    expect(totalOf(last)).toBe(TOTAL_COINS);

    for (let day = 0; day < 28; day++) {
      s.step();
      const now = s.world.ledger.snapshot();
      const transfers = diffToTransfers(last, now);
      // Applying the settled batch to the last on-chain state reproduces the
      // new ledger exactly, and never changes the 10,000 total.
      const settled = applyTransfers(last, transfers);
      for (const id of new Set([...Object.keys(settled), ...Object.keys(now)])) {
        expect(settled[id] ?? 0).toBe(now[id] ?? 0);
      }
      expect(totalOf(settled)).toBe(TOTAL_COINS);
      last = now;
    }
  });
});
