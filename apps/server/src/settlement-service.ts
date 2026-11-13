/**
 * Live on-chain settlement for the running game (Step 3.5).
 *
 * The contract holds ONE town's fixed 10,000 coins, so exactly one live room at
 * a time mirrors itself to the chain: the first room to go live claims the
 * settlement lease. As that room plays, the service diffs its ledger against the
 * snapshot it last settled and posts the net, conserving transfers to the
 * contract's `settle` with the operator key — so the on-chain audited total stays
 * exactly 10,000 and `settlement_count` climbs as the season runs.
 *
 * Game days tick fast (~1.2s), far quicker than a testnet transaction, so the
 * service throttles: it settles the accumulated net change no more than once
 * every `minIntervalMs`, and always does a final settle when the season ends.
 * Because the last-settled snapshot only advances on a successful post, a
 * throttled or failed settle simply rolls into the next one — never a gap.
 *
 * Opt-in: disabled unless NEAR operator credentials are configured AND
 * `SETTLE_ONCHAIN=1`, so an ordinary deploy never spends testnet gas by surprise.
 */

import type { Account } from "near-api-js";
import { makeAccount, settleBatch, type NearConfig } from "./settle-client.js";
import { diffToTransfers, type Balances } from "./settlement.js";
import type { Room } from "./rooms.js";

export interface SettlementRecord {
  /** The room game-day this batch settled through. */
  day: number;
  txHash: string;
  transfers: number;
  settlementIndex: number;
  at: number;
}

export class SettlementService {
  private account: Account | null = null;
  private leaseRoomId: string | null = null;
  private last: Balances | null = null;
  private lastAt = 0;
  private busy = false;
  private records: SettlementRecord[] = [];
  readonly enabled: boolean;

  constructor(
    private readonly cfg: NearConfig | null,
    private readonly minIntervalMs = Number(process.env.SETTLE_MIN_INTERVAL_MS ?? 8000),
  ) {
    this.enabled = !!(cfg && cfg.operatorId && cfg.operatorKey && cfg.contractId);
  }

  private async ensureAccount(): Promise<Account | null> {
    if (!this.account && this.cfg) this.account = await makeAccount(this.cfg);
    return this.account;
  }

  /** A newly-live room claims the single on-chain settlement lease, if it's free. */
  claim(room: Room): boolean {
    if (!this.enabled || this.leaseRoomId) return false;
    this.leaseRoomId = room.id;
    this.last = room.session.world.ledger.snapshot();
    this.lastAt = 0; // allow the first real settle immediately once there's change
    return true;
  }

  isSettling(roomId: string): boolean {
    return this.leaseRoomId === roomId;
  }

  /** Free the lease (room ended or emptied) so the next live room can settle. */
  release(roomId: string): void {
    if (this.leaseRoomId === roomId) {
      this.leaseRoomId = null;
      this.last = null;
    }
  }

  /**
   * Settle the leased room's net change, best-effort and non-blocking. Throttled
   * to `minIntervalMs` unless `force` (used at season end). Safe to call every
   * tick; overlapping calls are skipped while one is in flight.
   */
  async settleDay(room: Room, force = false): Promise<void> {
    if (!this.enabled || !this.cfg || this.leaseRoomId !== room.id || this.busy) return;
    if (!force && Date.now() - this.lastAt < this.minIntervalMs) return;

    const now = room.session.world.ledger.snapshot();
    const last = this.last ?? now;
    let transfers;
    try {
      transfers = diffToTransfers(last, now);
    } catch (e) {
      console.warn("[settle] diff refused:", (e as Error).message);
      return;
    }
    if (transfers.length === 0) {
      this.last = now;
      return;
    }

    this.busy = true;
    this.lastAt = Date.now();
    try {
      const account = await this.ensureAccount();
      if (!account) return;
      const result = await settleBatch(account, this.cfg.contractId, transfers);
      this.last = now; // advance only after a successful post
      if (result) {
        this.records.push({
          day: room.session.world.day,
          txHash: result.txHash,
          transfers: result.transfers,
          settlementIndex: result.settlementIndex,
          at: Date.now(),
        });
        if (this.records.length > 50) this.records.shift();
        console.log(
          `[settle] room ${room.id} day ${room.session.world.day}: ${result.transfers} transfers → #${result.settlementIndex} tx ${result.txHash}`,
        );
      }
    } catch (e) {
      console.warn("[settle] post failed:", (e as Error).message);
    } finally {
      this.busy = false;
    }
  }

  /** The most recent settlements, newest first (for the Proof panel's links). */
  recent(n = 10): SettlementRecord[] {
    return this.records.slice(-n).reverse();
  }

  status(): {
    enabled: boolean;
    contractId: string | null;
    network: string | null;
    settlingRoom: string | null;
    count: number;
    recent: SettlementRecord[];
  } {
    return {
      enabled: this.enabled,
      contractId: this.cfg?.contractId ?? null,
      network: this.cfg?.network ?? null,
      settlingRoom: this.leaseRoomId,
      count: this.records.length,
      recent: this.recent(),
    };
  }
}

/**
 * Build a NEAR config from the environment (process.env first, then the repo
 * `.env` for local dev). Returns null when settlement is not opted into, so the
 * service stays a safe no-op.
 */
export function nearConfigFromEnv(readEnvFile?: () => Record<string, string>): NearConfig | null {
  if (process.env.SETTLE_ONCHAIN !== "1" && process.env.SETTLE_ONCHAIN !== "true") return null;
  const file = readEnvFile?.() ?? {};
  const get = (k: string) => (process.env[k] ?? file[k] ?? "").trim();
  const operatorId = get("NEAR_OPERATOR_ACCOUNT_ID");
  const operatorKey = get("NEAR_OPERATOR_PRIVATE_KEY");
  const contractId = get("NEAR_CONTRACT_ID");
  if (!operatorId || !operatorKey || !contractId) return null;
  return {
    network: get("NEAR_NETWORK") || "testnet",
    rpcUrl: get("NEAR_RPC_URL") || "https://test.rpc.fastnear.com",
    operatorId,
    operatorKey,
    contractId,
  };
}
