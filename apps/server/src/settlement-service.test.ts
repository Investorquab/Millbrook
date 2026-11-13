import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Stub the NEAR client so the service runs offline.
const settleCalls: { transfers: unknown[] }[] = [];
vi.mock("./settle-client.js", () => ({
  makeAccount: vi.fn(async () => ({}) as never),
  settleBatch: vi.fn(async (_a: unknown, _c: string, transfers: unknown[]) => {
    settleCalls.push({ transfers });
    return { txHash: `tx${settleCalls.length}`, transfers: transfers.length, settlementIndex: settleCalls.length };
  }),
}));

import { SettlementService, nearConfigFromEnv } from "./settlement-service.js";
import type { Balances } from "./settlement.js";
import type { NearConfig } from "./settle-client.js";

const CFG: NearConfig = {
  network: "testnet",
  rpcUrl: "https://test.rpc.fastnear.com",
  operatorId: "op.testnet",
  operatorKey: "ed25519:fake",
  contractId: "millbrook.testnet",
};

/** A minimal room stand-in with a mutable ledger snapshot and day. */
function fakeRoom(id: string, balances: Balances) {
  const state = { day: 0, bal: { ...balances } };
  return {
    room: { id, session: { world: { get day() { return state.day; }, ledger: { snapshot: () => ({ ...state.bal }) } } } } as never,
    setDay: (d: number) => (state.day = d),
    setBal: (b: Balances) => (state.bal = { ...b }),
  };
}

describe("SettlementService", () => {
  beforeEach(() => {
    settleCalls.length = 0;
  });
  afterEach(() => {
    delete process.env.SETTLE_ONCHAIN;
  });

  it("is a safe no-op when disabled (no config)", async () => {
    const svc = new SettlementService(null);
    const { room } = fakeRoom("r1", { a: 5, b: 5 });
    expect(svc.enabled).toBe(false);
    expect(svc.claim(room)).toBe(false);
    await svc.settleDay(room, true);
    expect(settleCalls.length).toBe(0);
    expect(svc.status().enabled).toBe(false);
  });

  it("settles only one room at a time (a single on-chain lease)", () => {
    const svc = new SettlementService(CFG, 0);
    const a = fakeRoom("A", { x: 10, y: 0 });
    const b = fakeRoom("B", { x: 10, y: 0 });
    expect(svc.claim(a.room)).toBe(true);
    expect(svc.claim(b.room)).toBe(false); // lease taken
    expect(svc.isSettling("A")).toBe(true);
    svc.release("A");
    expect(svc.claim(b.room)).toBe(true); // freed
  });

  it("posts the net, conserving change and records the tx", async () => {
    const svc = new SettlementService(CFG, 0); // no throttle
    const r = fakeRoom("A", { shop: 10, worker: 0 });
    svc.claim(r.room);
    r.setDay(1);
    r.setBal({ shop: 7, worker: 3 }); // shop paid a 3-coin wage
    await svc.settleDay(r.room);
    expect(settleCalls.length).toBe(1);
    expect(settleCalls[0]!.transfers).toEqual([{ from: "shop", to: "worker", amount: 3 }]);
    expect(svc.recent()[0]).toMatchObject({ day: 1, transfers: 1, settlementIndex: 1 });
  });

  it("throttles: no second post before the interval, but a forced final settle lands", async () => {
    const svc = new SettlementService(CFG, 60_000); // 60s throttle
    const r = fakeRoom("A", { shop: 10, worker: 0 });
    svc.claim(r.room);
    r.setBal({ shop: 8, worker: 2 });
    await svc.settleDay(r.room); // first settle is allowed (lastAt=0)
    expect(settleCalls.length).toBe(1);
    r.setBal({ shop: 6, worker: 4 });
    await svc.settleDay(r.room); // throttled
    expect(settleCalls.length).toBe(1);
    await svc.settleDay(r.room, true); // forced (season end)
    expect(settleCalls.length).toBe(2);
  });

  it("skips an empty diff without posting", async () => {
    const svc = new SettlementService(CFG, 0);
    const r = fakeRoom("A", { shop: 10, worker: 0 });
    svc.claim(r.room);
    await svc.settleDay(r.room); // nothing changed
    expect(settleCalls.length).toBe(0);
  });
});

describe("nearConfigFromEnv", () => {
  afterEach(() => {
    delete process.env.SETTLE_ONCHAIN;
  });

  it("returns null unless SETTLE_ONCHAIN is set", () => {
    expect(nearConfigFromEnv(() => ({ NEAR_OPERATOR_ACCOUNT_ID: "op", NEAR_OPERATOR_PRIVATE_KEY: "k", NEAR_CONTRACT_ID: "c" }))).toBeNull();
  });

  it("builds a config from the env file when opted in", () => {
    process.env.SETTLE_ONCHAIN = "1";
    const cfg = nearConfigFromEnv(() => ({
      NEAR_OPERATOR_ACCOUNT_ID: "op.testnet",
      NEAR_OPERATOR_PRIVATE_KEY: "ed25519:k",
      NEAR_CONTRACT_ID: "millbrook.testnet",
    }));
    expect(cfg).toMatchObject({ operatorId: "op.testnet", contractId: "millbrook.testnet", network: "testnet" });
  });
});
