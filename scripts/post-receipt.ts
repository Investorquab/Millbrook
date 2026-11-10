/**
 * Run the OutLayer Game Master job for a sample town, then anchor its receipt
 * on NEAR testnet via the contract's `record_receipt`.
 *
 * Proof that M4 reaches the chain end to end: town state → Game Master decision
 * (+ reasoning, with the weather feed or a stated fallback) → a receipt hash →
 * an on-chain event anyone can read. Testnet only; spends nothing real.
 *
 *   pnpm tsx scripts/post-receipt.ts
 *
 * Reads NEAR_* and NEAR_CONTRACT_ID from .env (deploy the contract first). If
 * NEAR_AI_* is set the reasoning is live; otherwise it falls back and says so.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { connect, keyStores, KeyPair } from "near-api-js";
import { runGameMasterJob, type TownSnapshot } from "@millbrook/game-master";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const RPC_URL = "https://test.rpc.fastnear.com";

function readEnv() {
  const text = readFileSync(join(ROOT, ".env"), "utf8");
  const get = (k: string) => (text.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").trim();
  return {
    network: get("NEAR_NETWORK") || "testnet",
    operatorId: get("NEAR_OPERATOR_ACCOUNT_ID"),
    operatorKey: get("NEAR_OPERATOR_PRIVATE_KEY"),
    contractId: get("NEAR_CONTRACT_ID"),
    ai: {
      apiKey: get("NEAR_AI_API_KEY"),
      baseUrl: get("NEAR_AI_BASE_URL") || "https://cloud-api.near.ai/v1",
      model: get("NEAR_AI_MODEL"),
    },
  };
}

async function main() {
  const { network, operatorId, operatorKey, contractId, ai } = readEnv();
  if (network !== "testnet") throw new Error(`NEAR_NETWORK is "${network}", expected testnet`);
  if (!operatorId || !operatorKey) throw new Error("operator id/key missing in .env");
  if (!contractId) throw new Error("NEAR_CONTRACT_ID missing — run pnpm contract:deploy:testnet first");

  const town: TownSnapshot = {
    day: 20,
    seasonDays: 28,
    unemployment: 0.21,
    avgWage: 7.4,
    wheatPrice: 3,
    leaderCoins: 2300,
    runnerUpCoins: 1200,
    daysSinceLastEvent: 9,
  };

  console.log("→ Running the Game Master job …");
  const result = await runGameMasterJob(town, { ai });
  if (!result.decision) {
    console.log("No event fired for this town state; nothing to anchor.");
    return;
  }
  console.log(`  decision : ${result.decision.title} — ${result.decision.effect}`);
  console.log(`  reasoning: ${result.decision.reasoning} [${result.decision.reasoningSource}]`);
  console.log(`  weather  : ${result.weather.tempC}°C ${result.weather.condition} (${result.weather.source})`);
  console.log(`  receipt  : ${result.receipt.receiptHash}`);

  const keyStore = new keyStores.InMemoryKeyStore();
  await keyStore.setKey(network, operatorId, KeyPair.fromString(operatorKey as `ed25519:${string}`));
  const near = await connect({ networkId: network, nodeUrl: RPC_URL, keyStore });
  const account = await near.account(operatorId);

  console.log(`→ Anchoring the receipt on ${contractId} …`);
  const outcome = await account.functionCall({
    contractId,
    methodName: "record_receipt",
    args: { event_id: result.decision.eventId, day: town.day, receipt_hash: result.receipt.receiptHash },
    gas: 30_000_000_000_000n as unknown as bigint,
    attachedDeposit: 0n as unknown as bigint,
  });
  const txHash = outcome.transaction?.hash;

  console.log(`\nOK — Game Master receipt anchored on testnet`);
  console.log(`  event    : ${result.decision.eventId} (day ${town.day})`);
  console.log(`  tx       : ${txHash}`);
  console.log(`  explorer : https://testnet.nearblocks.io/txns/${txHash}`);
}

main().catch((e) => {
  console.error("✗ Failed:", e?.message ?? e);
  process.exit(1);
});
