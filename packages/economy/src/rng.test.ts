import { describe, it, expect } from "vitest";
import { Rng } from "./rng.js";

describe("Rng", () => {
  it("is deterministic for a given seed", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("gives different streams for different seeds", () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it("int stays within bounds", () => {
    const r = new Rng(123);
    for (let i = 0; i < 1000; i++) {
      const n = r.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  it("shuffle keeps all elements", () => {
    const r = new Rng(9);
    const out = r.shuffle([1, 2, 3, 4, 5]);
    expect(out.slice().sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("sample returns the requested count of distinct items", () => {
    const r = new Rng(5);
    const out = r.sample(["a", "b", "c", "d"], 2);
    expect(out.length).toBe(2);
    expect(new Set(out).size).toBe(2);
  });
});
