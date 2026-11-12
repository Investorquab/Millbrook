/**
 * Exercise the NEP-245 multi-token interface on testnet, end to end.
 *
 * Proves the goods ledger is a real NEP-245 multi token: reads contract
 * metadata, mints goods (operator `produce` → an `mt_mint` event), reads the
 * standard balance/supply/enumeration views, then does a standard `mt_transfer`
 * (1 yoctoNEAR, caller-signed → an `mt_transfer` event). Prints the NEP-245
 * events so you can see the standard "nep245" / "1.0.0" envelope on-chain.
 *
 * Testnet only; spends nothing real. Goods are not coins, so the 10,000-coin
 * total is never touched. Safe to re-run (it re-mints a little bread).
 *
 *   pnpm tsx scripts/nep245-smoke.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { connect, keyStores, KeyPair } from "near-api-js";

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

/** Pull every log line out of a transaction outcome. */
function logsOf(outcome: any): string[] {
  const logs: string[] = [...(outcome.transaction_outcome?.outcome?.logs ?? [])];
  for (const r of outcome.receipts_outcome ?? []) logs.push(...(r.outcome?.logs ?? []));
  return logs;
}

async function main() {
  const { network, operatorId, operatorKey, contractId } = readEnv();
  if (!operatorId || !operatorKey || !contractId) throw new Error("operator/contract missing in .env");

  const keyStore = new keyStores.InMemoryKeyStore();
  await keyStore.setKey(network, operatorId, KeyPair.fromString(operatorKey as `ed25519:${string}`));
  const near = await connect({ networkId: network, nodeUrl: RPC_URL, keyStore });
  const account = await near.account(operatorId);
  const view = (methodName: string, args: object = {}) => account.viewFunction({ contractId, methodName, args });
  const call = (methodName: string, args: object, deposit = 0n) =>
    account.functionCall({
      contractId,
      methodName,
      args,
      gas: 30_000_000_000_000n as unknown as bigint,
      attachedDeposit: deposit as unknown as bigint,
    });

  console.log("NEP-245 contract metadata:", await view("mt_metadata"));

  // 1) Mint: operator produces bread into a workshop AND into its own account
  //    (so it can then do a standard self-signed transfer below).
  const mint1 = await call("produce", { account: "w0", good: "bread", amount: 10 });
  console.log("\nmt_mint event (produce → w0):");
  logsOf(mint1).filter((l) => l.includes("nep245")).forEach((l) => console.log("  " + l));
  await call("produce", { account: operatorId, good: "bread", amount: 4 });

  // 2) Standard views.
  console.log("\nStandard views:");
  console.log("  mt_supply(bread)       =", await view("mt_supply", { token_id: "bread" }));
  console.log("  mt_supply(unobtanium)  =", await view("mt_supply", { token_id: "unobtanium" }), "(unknown → null)");
  console.log("  mt_balance_of(w0,bread)=", await view("mt_balance_of", { account_id: "w0", token_id: "bread" }));
  console.log("  mt_batch_balance_of    =", await view("mt_batch_balance_of", { account_id: "w0", token_ids: ["bread", "cloth"] }));
  console.log("  mt_token([bread,xyz])  =", JSON.stringify(await view("mt_token", { token_ids: ["bread", "xyz"] })));
  console.log("  mt_tokens              =", JSON.stringify(await view("mt_tokens", { from_index: 0, limit: 20 })));
  console.log("  mt_tokens_for_owner(w0)=", JSON.stringify(await view("mt_tokens_for_owner", { account_id: "w0", from_index: 0, limit: 20 })));

  // 3) Standard transfer: the operator moves 2 of its own bread to w0, signed,
  //    with exactly 1 yoctoNEAR, as any NEP-245 holder would.
  const xfer = await call("mt_transfer", { receiver_id: "w0", token_id: "bread", amount: "2" }, 1n);
  console.log("\nmt_transfer event (standard, 1 yocto):");
  logsOf(xfer).filter((l) => l.includes("nep245")).forEach((l) => console.log("  " + l));
  console.log("  tx:", `https://testnet.nearblocks.io/txns/${xfer.transaction?.hash}`);

  console.log("\n✓ NEP-245 interface verified live on", contractId);
}

main().catch((e) => {
  console.error("✗", e?.message ?? e);
  process.exit(1);
});
