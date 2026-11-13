/**
 * Room persistence (Step 5). A room is saved as a {@link RoomSnapshot}: its seed,
 * players, chat and the ordered log of deterministic season mutations. Because
 * the economy engine is deterministic, replaying that log on a fresh season from
 * the same seed reproduces the exact world — so we never serialize the live
 * object graph, only the inputs that produced it.
 *
 * Two stores: an in-memory one (the default, used in tests and when no database
 * is configured) and a Postgres one (used when DATABASE_URL is set — the server
 * then survives a restart with nothing lost). The Postgres driver is imported
 * lazily, so the server boots fine without `pg` installed.
 */

import type { RoomSnapshot } from "./rooms.js";

export interface RoomStore {
  /** Create the backing table if needed (a no-op for the memory store). */
  init(): Promise<void>;
  /** Insert or replace one room's snapshot. */
  save(snapshot: RoomSnapshot): Promise<void>;
  /** Load every saved room (for boot). */
  loadAll(): Promise<RoomSnapshot[]>;
  /** Remove a room (it ended and rolled off, or was emptied). */
  remove(id: string): Promise<void>;
  close(): Promise<void>;
}

/** The default store: holds snapshots in memory. Nothing survives a restart. */
export class MemoryRoomStore implements RoomStore {
  private readonly rows = new Map<string, RoomSnapshot>();
  async init(): Promise<void> {}
  async save(snapshot: RoomSnapshot): Promise<void> {
    this.rows.set(snapshot.id, structuredClone(snapshot));
  }
  async loadAll(): Promise<RoomSnapshot[]> {
    return [...this.rows.values()].map((r) => structuredClone(r));
  }
  async remove(id: string): Promise<void> {
    this.rows.delete(id);
  }
  async close(): Promise<void> {}
}

/**
 * Postgres-backed store. One table, one JSONB column per room — the snapshot is
 * small (seed + a capped op-log + chat), so a row per room is plenty. `pg` is
 * imported lazily so it's only required when a DATABASE_URL is configured.
 */
export class PostgresRoomStore implements RoomStore {
  // Typed loosely to avoid a hard compile-time dependency on `pg`.
  private pool: { query: (text: string, params?: unknown[]) => Promise<{ rows: { snapshot: RoomSnapshot }[] }>; end: () => Promise<void> } | null = null;

  constructor(private readonly connectionString: string) {}

  async init(): Promise<void> {
    const { Pool } = (await import("pg")) as unknown as { Pool: new (cfg: { connectionString: string }) => NonNullable<PostgresRoomStore["pool"]> };
    this.pool = new Pool({ connectionString: this.connectionString });
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS rooms (
         id TEXT PRIMARY KEY,
         snapshot JSONB NOT NULL,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
  }

  async save(snapshot: RoomSnapshot): Promise<void> {
    if (!this.pool) throw new Error("PostgresRoomStore not initialized");
    await this.pool.query(
      `INSERT INTO rooms (id, snapshot, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = now()`,
      [snapshot.id, JSON.stringify(snapshot)],
    );
  }

  async loadAll(): Promise<RoomSnapshot[]> {
    if (!this.pool) throw new Error("PostgresRoomStore not initialized");
    const res = await this.pool.query(`SELECT snapshot FROM rooms ORDER BY updated_at DESC`);
    return res.rows.map((r) => r.snapshot);
  }

  async remove(id: string): Promise<void> {
    if (!this.pool) throw new Error("PostgresRoomStore not initialized");
    await this.pool.query(`DELETE FROM rooms WHERE id = $1`, [id]);
  }

  async close(): Promise<void> {
    await this.pool?.end();
    this.pool = null;
  }
}

/** Pick a store from the environment: Postgres if DATABASE_URL is set, else memory. */
export function makeRoomStore(databaseUrl?: string): RoomStore {
  return databaseUrl ? new PostgresRoomStore(databaseUrl) : new MemoryRoomStore();
}
