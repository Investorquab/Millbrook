/**
 * Run a solo season and settle each game day to the live NEAR contract.
 *
 * This is the server's dusk settlement, proven end to end: for each day it
 * diffs the ledger, posts the net transfers on-chain, and records the tx hash.
 * At the end it checks the contract's audited total is still exactly 10,000.
 *
 * Testnet only; a few game days so the run is quick and cheap.
 *
 *   pnpm --filter @millbrook/server settle-season            # 3 days
 *   pnpm --filter @millbrook/server settle-season -- --days 5 --seed 7
 *
 * Reads NEAR_* and NEAR_CONTRACT_ID from .env, and expects the contract to be
 * seeded (pnpm contract:deploy:testnet) with the SAME seed's starting split.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TOTAL_COINS } from "@millbrook/shared";
import { createSoloSession } from "@millbrook/economy";
import { diffToTransfers } from "./settlement.js";
import { makeAccount, settleBatch, viewU64, type NearConfig } from "./settle-client.js";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

function readEnv(): NearConfig & { aiSeed: number } {
  const text = readFileSync(join(ROOT, ".env"), "utf8");
  const get = (k: string) => (text.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").trim();
  return {
    network: get("NEAR_NETWORK") || "testnet",
    rpcUrl: "https://test.rpc.fastnear.com",
    operatorId: get("NEAR_OPERATOR_ACCOUNT_ID"),
    operatorKey: get("NEAR_OPERATOR_PRIVATE_KEY"),
    contractId: get("NEAR_CONTRACT_ID"),
    aiSeed: 42,
  };
}

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
}

async function main() {
  const cfg = readEnv();
  if (cfg.network !== "testnet") throw new Error(`NEAR_NETWORK is "${cfg.network}", expected testnet`);
  if (!cfg.operatorId || !cfg.operatorKey) throw new Error("operator id/key missing in .env");
  if (!cfg.contractId) throw new Error("NEAR_CONTRACT_ID missing — run pnpm contract:deploy:testnet first");

  const seed = arg("seed", 42);
  const days = arg("days", 3);

  const account = await makeAccount(cfg);

  // The contract was seeded from the simulation's starting split. Run the SAME
  // season here so our off-chain ledger tracks the on-chain one.
  const session = createSoloSession(seed);
  let last = session.world.ledger.snapshot();

  const onChainStart = await viewU64(account, cfg.contractId, "audit_total");
  console.log(`Contract ${cfg.contractId}: audited total ${onChainStart} (expect ${TOTAL_COINS}).`);
  if (onChainStart !== TOTAL_COINS) {
    console.error("✗ On-chain total is not 10,000 — reseed with the matching season first.");
    process.exit(1);
  }

  const hashes: string[] = [];
  for (let day = 0; day < days; day++) {
    session.step();
    const now = session.world.ledger.snapshot();
    const transfers = diffToTransfers(last, now);
    const result = await settleBatch(account, cfg.contractId, transfers);
    last = now;
    if (result) {
      hashes.push(result.txHash);
      console.log(
        `Day ${day + 1}: settled ${result.transfers} transfers → settlement #${result.settlementIndex}  tx ${result.txHash}`,
      );
    } else {
      console.log(`Day ${day + 1}: nothing to settle.`);
    }
  }

  const audited = await viewU64(account, cfg.contractId, "audit_total");
  const settlements = await viewU64(account, cfg.contractId, "settlement_count");
  console.log(`\n${audited === TOTAL_COINS ? "OK" : "✗ FAIL"} — on-chain audited total ${audited} after ${settlements} settlements.`);
  console.log(`  tx hashes recorded: ${hashes.length}`);
  if (hashes[0]) console.log(`  explorer: https://testnet.nearblocks.io/txns/${hashes[hashes.length - 1]}`);
  if (audited !== TOTAL_COINS) process.exit(1);
}

main().catch((e) => {
  console.error("✗ settle-season failed:", e?.message ?? e);
  process.exit(1);
});
