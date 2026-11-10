/**
 * Settle one real batch on testnet and verify the invariant held.
 *
 * Proof that settlement works end to end on-chain: it reads two balances,
 * settles a small batch between them as the operator, then reads them back and
 * re-checks that the audited total is still exactly 10,000. Prints the
 * transaction hash and an explorer link.
 *
 * Testnet only; spends nothing real. Safe to run repeatedly — it moves a couple
 * of coins from the town hall to a resident and is fully reversible by the next
 * season's re-seed.
 *
 *   pnpm tsx scripts/settle-smoke.ts
 *
 * Reads NEAR_* and NEAR_CONTRACT_ID from .env (run the deploy first).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { connect, keyStores, KeyPair } from "near-api-js";
import { TOTAL_COINS } from "@millbrook/shared";

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
  };
}

async function main() {
  const { network, operatorId, operatorKey, contractId } = readEnv();
  if (network !== "testnet") throw new Error(`NEAR_NETWORK is "${network}", expected testnet`);
  if (!operatorId || !operatorKey) throw new Error("operator id/key missing in .env");
  if (!contractId) throw new Error("NEAR_CONTRACT_ID missing — run pnpm contract:deploy:testnet first");

  const keyStore = new keyStores.InMemoryKeyStore();
  await keyStore.setKey(network, operatorId, KeyPair.fromString(operatorKey as `ed25519:${string}`));
  const near = await connect({ networkId: network, nodeUrl: RPC_URL, keyStore });
  const account = await near.account(operatorId);

  const view = (methodName: string, args: object = {}) =>
    account.viewFunction({ contractId, methodName, args });

  const totalBefore = await view("audit_total");
  const hallBefore = await view("balance_of", { account: "townhall" });
  const r0Before = await view("balance_of", { account: "r0" });
  const settlementsBefore = await view("settlement_count");

  console.log(`Before: total=${totalBefore}, townhall=${hallBefore}, r0=${r0Before}, settlements=${settlementsBefore}`);

  // The town hall pays a 5-coin benefit to resident r0.
  const transfers = [{ from: "townhall", to: "r0", amount: 5 }];
  console.log(`→ Settling batch: ${JSON.stringify(transfers)} …`);
  const outcome = await account.functionCall({
    contractId,
    methodName: "settle",
    args: { transfers },
    gas: 100_000_000_000_000n as unknown as bigint,
    attachedDeposit: 0n as unknown as bigint,
  });
  const txHash = outcome.transaction?.hash ?? outcome.transaction_outcome?.id;

  const totalAfter = await view("audit_total");
  const hallAfter = await view("balance_of", { account: "townhall" });
  const r0After = await view("balance_of", { account: "r0" });
  const settlementsAfter = await view("settlement_count");

  console.log(`After:  total=${totalAfter}, townhall=${hallAfter}, r0=${r0After}, settlements=${settlementsAfter}`);

  const ok =
    totalAfter === TOTAL_COINS &&
    hallAfter === hallBefore - 5 &&
    r0After === r0Before + 5 &&
    settlementsAfter === settlementsBefore + 1;

  console.log(`\n${ok ? "OK" : "✗ FAILED"} — settlement ${ok ? "conserved the 10,000-coin total" : "did NOT behave as expected"}`);
  console.log(`  tx       : ${txHash}`);
  console.log(`  explorer : https://testnet.nearblocks.io/txns/${txHash}`);
  console.log(`  contract : https://testnet.nearblocks.io/address/${contractId}`);
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error("✗ Smoke test failed:", e?.message ?? e);
  process.exit(1);
});
