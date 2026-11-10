import { describe, it, expect } from "vitest";
import { Ledger } from "./ledger.js";

describe("Ledger", () => {
  it("conserves the total across transfers", () => {
    const l = new Ledger({ a: 100, b: 50, c: 0 });
    expect(l.total()).toBe(150);
    l.transfer("a", "b", 30);
    l.transfer("b", "c", 10);
    expect(l.total()).toBe(150);
    expect(l.get("a")).toBe(70);
    expect(l.get("b")).toBe(70);
    expect(l.get("c")).toBe(10);
  });

  it("refuses a transfer the source cannot cover", () => {
    const l = new Ledger({ a: 5, b: 0 });
    expect(() => l.transfer("a", "b", 6)).toThrow();
    expect(l.total()).toBe(5);
  });

  it("payUpTo moves only what is available and conserves the total", () => {
    const l = new Ledger({ a: 5, b: 0 });
    const moved = l.payUpTo("a", "b", 8);
    expect(moved).toBe(5);
    expect(l.get("a")).toBe(0);
    expect(l.get("b")).toBe(5);
    expect(l.total()).toBe(5);
  });

  it("rejects non-integer and negative amounts", () => {
    const l = new Ledger({ a: 10, b: 0 });
    expect(() => l.transfer("a", "b", 1.5)).toThrow();
    expect(() => l.transfer("a", "b", -1)).toThrow();
  });

  it("assertInvariant throws only when the total drifts", () => {
    const l = new Ledger({ a: 10, b: 0 });
    expect(() => l.assertInvariant(10)).not.toThrow();
    expect(() => l.assertInvariant(11)).toThrow();
  });
});
