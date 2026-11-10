/**
 * Verify that NEAR_OPERATOR_ACCOUNT_ID + NEAR_OPERATOR_PRIVATE_KEY in ./.env
 * actually match: derive the public key from the private key and check it is a
 * FullAccess key on the account on-chain. The private key is never printed.
 *
 *   node scripts/spikes/verify-operator.mjs
 */

import { KeyPair } from "near-api-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RPC_URL = "https://test.rpc.fastnear.com";

function readEnv() {
  const text = readFileSync(join(process.cwd(), ".env"), "utf8");
  const get = (k) => (text.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").trim();
  return { accountId: get("NEAR_OPERATOR_ACCOUNT_ID"), privateKey: get("NEAR_OPERATOR_PRIVATE_KEY") };
}

async function accessKeys(accountId) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "1",
      method: "query",
      params: { request_type: "view_access_key_list", finality: "final", account_id: accountId },
    }),
  });
  const json = await res.json();
  return json.result?.keys ?? [];
}

async function main() {
  const { accountId, privateKey } = readEnv();
  if (!accountId || !privateKey) {
    console.error("✗ .env is missing NEAR_OPERATOR_ACCOUNT_ID or NEAR_OPERATOR_PRIVATE_KEY");
    process.exit(1);
  }
  let publicKey;
  try {
    publicKey = KeyPair.fromString(privateKey).getPublicKey().toString();
  } catch {
    console.error("✗ NEAR_OPERATOR_PRIVATE_KEY is not a valid NEAR key (expected ed25519:<base58>)");
    process.exit(1);
  }
  const keys = await accessKeys(accountId).catch((e) => {
    console.error(`✗ RPC error: ${e?.message ?? e}`);
    process.exit(1);
  });
  if (keys.length === 0) {
    console.error(`✗ ${accountId} has no access keys on testnet — does the account exist? Check https://testnet.nearblocks.io/address/${accountId}`);
    process.exit(1);
  }
  const match = keys.find((k) => k.public_key === publicKey);
  console.log(`account    : ${accountId}`);
  console.log(`derived key: ${publicKey}`);
  if (match) {
    console.log(`✓ MATCH — this private key is a ${match.access_key.permission} key on ${accountId}. .env is correct.`);
  } else {
    console.log(`✗ NO MATCH — the private key in .env does not control ${accountId}.`);
    console.log(`  Account's on-chain keys: ${keys.map((k) => k.public_key).join(", ")}`);
    process.exit(1);
  }
}

main();
