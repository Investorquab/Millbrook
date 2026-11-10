/**
 * A small, fast, seeded PRNG (mulberry32). The economy package is pure and
 * deterministic: every random choice in the simulation goes through an Rng
 * created from the season seed, so the same seed always produces the same
 * season. Never call `Math.random()` anywhere in this package.
 */

export class Rng {
  private state: number;

  constructor(seed: number) {
    // Mix the seed so small seeds (0, 1, 2…) still give well-spread streams.
    this.state = (seed ^ 0x9e3779b9) >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (max < min) throw new Error(`Rng.int: max ${max} < min ${min}`);
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Pick one element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Rng.pick: empty array");
    return items[this.int(0, items.length - 1)]!;
  }

  /** Fisher–Yates shuffle into a new array. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const a = out[i]!;
      out[i] = out[j]!;
      out[j] = a;
    }
    return out;
  }

  /** Pick `n` distinct elements, order randomised. */
  sample<T>(items: readonly T[], n: number): T[] {
    return this.shuffle(items).slice(0, Math.min(n, items.length));
  }
}
