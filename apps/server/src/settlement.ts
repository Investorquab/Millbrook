/**
 * Settlement: turn a game day's change in balances into a batch of transfers
 * the NEAR contract will accept.
 *
 * The simulation moves coins internally all day (wages, sales, raw materials).
 * At dusk the server settles *the net result*: it diffs the ledger snapshot
 * against the one it last settled and produces a minimal set of conserving
 * `(from, to, amount)` transfers that carries the on-chain balances from the
 * old state to the new one. Because both snapshots sum to the same fixed total,
 * the transfers conserve by construction — the contract would reject them
 * otherwise.
 *
 * Pure and deterministic: no network, no keys. `settle-client.ts` posts the
 * result on-chain.
 */

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

export type Balances = Record<string, number>;

export function totalOf(b: Balances): number {
  let sum = 0;
  for (const v of Object.values(b)) sum += v;
  return sum;
}

/**
 * The minimal conserving transfers that turn `before` into `after`.
 *
 * Throws if the two snapshots do not hold the same total (a settlement must
 * never change the money supply). Deterministic: accounts are matched in id
 * order, so the same day always produces the same batch.
 */
export function diffToTransfers(before: Balances, after: Balances): Transfer[] {
  const beforeTotal = totalOf(before);
  const afterTotal = totalOf(after);
  if (beforeTotal !== afterTotal) {
    throw new Error(
      `Refusing to settle: total changed from ${beforeTotal} to ${afterTotal}. A settlement must conserve coins.`,
    );
  }

  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  const debtors: { id: string; amt: number }[] = []; // lost coins since last settle
  const creditors: { id: string; amt: number }[] = []; // gained coins
  for (const id of ids) {
    const delta = (after[id] ?? 0) - (before[id] ?? 0);
    if (!Number.isInteger(delta)) {
      throw new Error(`Refusing to settle: non-integer delta ${delta} for ${id}.`);
    }
    if (delta < 0) debtors.push({ id, amt: -delta });
    else if (delta > 0) creditors.push({ id, amt: delta });
  }

  const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  debtors.sort(byId);
  creditors.sort(byId);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const give = Math.min(debtors[i]!.amt, creditors[j]!.amt);
    if (give > 0) transfers.push({ from: debtors[i]!.id, to: creditors[j]!.id, amount: give });
    debtors[i]!.amt -= give;
    creditors[j]!.amt -= give;
    if (debtors[i]!.amt === 0) i++;
    if (creditors[j]!.amt === 0) j++;
  }
  return transfers;
}

/** Apply transfers to a snapshot (for verification). */
export function applyTransfers(before: Balances, transfers: Transfer[]): Balances {
  const bal: Balances = { ...before };
  for (const t of transfers) {
    bal[t.from] = (bal[t.from] ?? 0) - t.amount;
    bal[t.to] = (bal[t.to] ?? 0) + t.amount;
  }
  return bal;
}
