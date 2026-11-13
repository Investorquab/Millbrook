/**
 * Live smoke for the auto-settlement service: make a real room, claim the
 * on-chain lease, play a few days, and settle each one to the contract — then
 * confirm the audited total is still exactly 10,000.
 *
 *   SETTLE_ONCHAIN=1 pnpm --filter @millbrook/server exec tsx src/settle-service-smoke.ts
 *
 * Testnet only; a few game days so it's quick and cheap.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TOTAL_COINS } from "@millbrook/shared";
import { RoomManager } from "./rooms.js";
import { SettlementService, nearConfigFromEnv } from "./settlement-service.js";
import { makeAccount, viewU64, type NearConfig } from "./settle-client.js";

process.env.SETTLE_ONCHAIN = "1";

const readRepoEnv = (): Record<string, string> => {
  const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
  const text = readFileSync(join(root, ".env"), "utf8");
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]!] = m[2]!.trim();
  }
  return out;
};

async function main() {
  const cfg = nearConfigFromEnv(readRepoEnv) as NearConfig | null;
  if (!cfg) throw new Error("NEAR creds missing — can't smoke-test settlement.");
  const svc = new SettlementService(cfg, 0); // no throttle, so each day posts
  if (!svc.enabled) throw new Error("service did not enable with the given config.");

  const account = await makeAccount(cfg);
  const before = await viewU64(account, cfg.contractId, "audit_total");
  const countBefore = await viewU64(account, cfg.contractId, "settlement_count");
  console.log(`Contract ${cfg.contractId}: audited ${before}, ${countBefore} settlements so far.`);

  const rooms = new RoomManager();
  const room = rooms.create("host", "Host", 42); // seed 42 matches the deployed split
  room.start();
  console.log(`Room ${room.id} live; claiming the on-chain lease: ${svc.claim(room)}`);

  for (let day = 0; day < 3; day++) {
    room.step();
    await svc.settleDay(room, true);
  }

  const after = await viewU64(account, cfg.contractId, "audit_total");
  const countAfter = await viewU64(account, cfg.contractId, "settlement_count");
  console.log(`\nSettled ${svc.recent().length} batch(es):`);
  for (const r of svc.recent()) {
    console.log(`  day ${r.day}: ${r.transfers} transfers → #${r.settlementIndex}  https://testnet.nearblocks.io/txns/${r.txHash}`);
  }
  console.log(`\n${after === TOTAL_COINS ? "OK" : "✗ FAIL"} — audited total ${after} after ${countAfter} settlements (was ${countBefore}).`);
  if (after !== TOTAL_COINS) process.exit(1);
}

main().catch((e) => {
  console.error("✗ smoke failed:", e?.message ?? e);
  process.exit(1);
});
