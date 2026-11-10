/**
 * Deploy the Millbrook economy ledger to NEAR testnet.
 *
 * Testnet only. This signs with the operator key already in .env and spends
 * nothing real. It:
 *
 *   1. Loads the compiled wasm from contracts/millbrook/target/… (run
 *      `pnpm contract:build` first).
 *   2. Deploys it onto the operator account itself — the operator already
 *      exists, is funded, and we hold its full-access key, so there is no
 *      sub-account to create or fund.
 *   3. Seeds the ledger with the simulation's real starting split of the
 *      10,000 coins (computed from the economy package, so it always sums to
 *      exactly 10,000 and uses the real account ids r0.., w0.., coop, townhall).
 *   4. Writes NEAR_CONTRACT_ID back into .env and prints the explorer link.
 *
 * Re-running is safe: the wasm is redeployed, and `new` is skipped if the
 * ledger is already initialised (so balances are never reset).
 *
 *   pnpm contract:deploy:testnet            # seed 42, 28 days
 *   pnpm contract:deploy:testnet -- --seed 7
 *
 * The private key is never printed.
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { connect, keyStores, KeyPair } from "near-api-js";
import { createWorld } from "@millbrook/economy";
import { TOTAL_COINS } from "@millbrook/shared";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const WASM_PATH = join(
  ROOT,
  "contracts/millbrook/target/wasm32-unknown-unknown/release/millbrook_contract.wasm",
);
const RPC_URL = "https://test.rpc.fastnear.com";

function readEnv(): Record<string, string> {
  let text = "";
  try {
    text = readFileSync(join(ROOT, ".env"), "utf8");
  } catch {
    return {};
  }
  const get = (k: string) => (text.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").trim();
  return {
    network: get("NEAR_NETWORK") || "testnet",
    operatorId: get("NEAR_OPERATOR_ACCOUNT_ID"),
    operatorKey: get("NEAR_OPERATOR_PRIVATE_KEY"),
    contractId: get("NEAR_CONTRACT_ID"),
  };
}

/** Persist NEAR_CONTRACT_ID into .env without touching anything else. */
function writeContractId(id: string): void {
  const envPath = join(ROOT, ".env");
  let env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const line = `NEAR_CONTRACT_ID=${id}`;
  const re = /^NEAR_CONTRACT_ID=.*$/m;
  if (re.test(env)) env = env.replace(re, line);
  else env += (env.endsWith("\n") || env === "" ? "" : "\n") + line + "\n";
  writeFileSync(envPath, env, { mode: 0o600 });
}

/** The season's starting coin split, straight from the simulation. */
function buildSeed(seed: number): [string, number][] {
  const world = createWorld({ seed, days: 28 });
  const snapshot = world.ledger.snapshot();
  const entries = Object.entries(snapshot) as [string, number][];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total !== TOTAL_COINS) {
    throw new Error(`Seed sums to ${total}, expected ${TOTAL_COINS} — refusing to deploy`);
  }
  return entries;
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

async function main() {
  const { network, operatorId, operatorKey, contractId } = readEnv();

  if (network !== "testnet") {
    console.error(`✗ NEAR_NETWORK is "${network}". This script only deploys to testnet.`);
    process.exit(1);
  }
  if (!operatorId || !operatorKey) {
    console.error("✗ NEAR_OPERATOR_ACCOUNT_ID / NEAR_OPERATOR_PRIVATE_KEY missing in .env.");
    console.error("  Create the operator first: node scripts/spikes/create-operator.mjs");
    process.exit(1);
  }
  if (!existsSync(WASM_PATH)) {
    console.error(`✗ Contract wasm not found at:\n    ${WASM_PATH}`);
    console.error("  Build it first:  pnpm contract:build");
    process.exit(1);
  }

  // The contract lives on the operator account itself (see header).
  const targetId = contractId || operatorId;
  if (contractId && contractId !== operatorId) {
    console.error(
      `✗ NEAR_CONTRACT_ID (${contractId}) is not the operator account (${operatorId}).\n` +
        "  This script deploys onto the operator account. Clear NEAR_CONTRACT_ID or set it to the operator id.",
    );
    process.exit(1);
  }

  const seedN = Number(arg("seed", "42"));
  const seed = buildSeed(seedN);

  const keyStore = new keyStores.InMemoryKeyStore();
  await keyStore.setKey(network, operatorId, KeyPair.fromString(operatorKey as `ed25519:${string}`));
  const near = await connect({ networkId: network, nodeUrl: RPC_URL, keyStore });
  const account = await near.account(operatorId);

  console.log(`→ Deploying wasm to ${targetId} …`);
  const wasm = readFileSync(WASM_PATH);
  await account.deployContract(wasm);
  console.log(`  deployed ${(wasm.length / 1024).toFixed(0)} KB of code`);

  // Already initialised? Then keep the live balances; just redeploy the code.
  let initialised = false;
  try {
    const supply = await account.viewFunction({ contractId: targetId, methodName: "total_supply", args: {} });
    initialised = typeof supply === "number";
  } catch {
    initialised = false;
  }

  if (initialised) {
    console.log("  ledger already initialised — skipping `new` (balances preserved)");
  } else {
    console.log(`→ Seeding the ledger (seed ${seedN}, ${seed.length} accounts, ${TOTAL_COINS} coins) …`);
    await account.functionCall({
      contractId: targetId,
      methodName: "new",
      args: { operator: operatorId, seed },
      gas: 100_000_000_000_000n as unknown as bigint,
      attachedDeposit: 0n as unknown as bigint,
    });
    console.log("  ledger seeded");
  }

  // Verify on chain.
  const supply = await account.viewFunction({ contractId: targetId, methodName: "total_supply", args: {} });
  const audited = await account.viewFunction({ contractId: targetId, methodName: "audit_total", args: {} });
  const operatorOnChain = await account.viewFunction({ contractId: targetId, methodName: "get_operator", args: {} });

  if (supply !== TOTAL_COINS || audited !== TOTAL_COINS) {
    console.error(`✗ On-chain total is ${supply}/${audited}, expected ${TOTAL_COINS}.`);
    process.exit(1);
  }

  writeContractId(targetId);

  console.log("\nOK — Millbrook ledger live on testnet");
  console.log(`  contract id : ${targetId}`);
  console.log(`  operator    : ${operatorOnChain}`);
  console.log(`  total supply: ${supply} coins  (audited on chain: ${audited})`);
  console.log(`  explorer    : https://testnet.nearblocks.io/address/${targetId}`);
  console.log(`  .env        : NEAR_CONTRACT_ID written`);
  console.log(`\n  Next: the server settles a batch each dusk via functionCall "settle".`);
}

main().catch((e) => {
  console.error("✗ Deploy failed:", e?.message ?? e);
  process.exit(1);
});
