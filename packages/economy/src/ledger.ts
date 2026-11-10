/**
 * The coin ledger. Every coin in Millbrook lives in exactly one account here,
 * and coins only ever move between accounts — they are never minted or burned
 * after the season is seeded. This is the off-chain mirror of the NEAR
 * contract's ledger, and it enforces the same invariant: the sum of all
 * balances is always the fixed total.
 *
 * Goods (bread, cloth, tools…) are NOT coins and are tracked elsewhere; only
 * coins count toward the 10,000 total.
 */

export class Ledger {
  private readonly balances = new Map<string, number>();

  constructor(initial?: Record<string, number>) {
    if (initial) {
      for (const [id, amount] of Object.entries(initial)) {
        this.setInitial(id, amount);
      }
    }
  }

  /** Seed an account. Only used while building the starting state. */
  setInitial(id: string, amount: number): void {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error(`Ledger.setInitial: ${id} amount must be a non-negative integer, got ${amount}`);
    }
    this.balances.set(id, amount);
  }

  /** Ensure an account exists (balance 0) — e.g. a new arrival. */
  ensure(id: string): void {
    if (!this.balances.has(id)) this.balances.set(id, 0);
  }

  get(id: string): number {
    return this.balances.get(id) ?? 0;
  }

  /**
   * Move exactly `amount` from `from` to `to`. Throws if the amount is not a
   * non-negative integer or the source cannot cover it — callers that expect
   * shortfalls should use `payUpTo` instead.
   */
  transfer(from: string, to: string, amount: number): void {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error(`Ledger.transfer: amount must be a non-negative integer, got ${amount}`);
    }
    if (amount === 0) return;
    const fromBal = this.get(from);
    if (fromBal < amount) {
      throw new Error(`Ledger.transfer: ${from} has ${fromBal}, cannot send ${amount} to ${to}`);
    }
    this.balances.set(from, fromBal - amount);
    this.balances.set(to, this.get(to) + amount);
  }

  /**
   * Move up to `amount` from `from` to `to`, limited by the source balance.
   * Returns the amount actually moved. Used where a payer may be short (wages
   * from a struggling workshop, benefits from a thin treasury).
   */
  payUpTo(from: string, to: string, amount: number): number {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error(`Ledger.payUpTo: amount must be a non-negative integer, got ${amount}`);
    }
    const moved = Math.min(amount, this.get(from));
    if (moved > 0) {
      this.balances.set(from, this.get(from) - moved);
      this.balances.set(to, this.get(to) + moved);
    }
    return moved;
  }

  total(): number {
    let sum = 0;
    for (const v of this.balances.values()) sum += v;
    return sum;
  }

  /** Snapshot of all balances, for reporting and settlement. */
  snapshot(): Record<string, number> {
    return Object.fromEntries(this.balances);
  }

  ids(): string[] {
    return [...this.balances.keys()];
  }

  /** Throws if the total has drifted from the expected fixed supply. */
  assertInvariant(expectedTotal: number): void {
    const total = this.total();
    if (total !== expectedTotal) {
      throw new Error(`Coin invariant broken: total is ${total}, expected ${expectedTotal}`);
    }
  }
}
