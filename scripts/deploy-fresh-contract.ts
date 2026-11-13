/**
 * Deploy a FRESH Millbrook ledger to a new testnet sub-account, seeded clean.
 *
 * Why: the economy settles by posting the *net daily diff* from a season's
 * genesis. Once an account has been settled against repeatedly it drifts away
 * from any clean season's day-0 split, and further diffs are (correctly) refused
 * by the contract ("a settlement cannot create coins"). To demonstrate live coin
 * settlement end to end you need a contract whose on-chain balances start at a
 * known season's genesis. This script makes one.
 *
 * It:
 *   1. Loads the compiled wasm (run `pnpm contract:build` first).
 *   2. Creates a sub-account of the operator (default game.<operator>), funded
 *      from the operator, with a fresh key.
 *   3. Deploys the wasm to it and calls `new(operator=<operator>, seed)` with the
 *      simulation's real starting split for --seed (so the operator can settle it).
 *   4. Verifies total_supply / audit_total == 10,000 and prints the explorer link.
 *   5. Writes NEAR_CONTRACT_ID (and the sub-account key, for recovery) to .env.
 *
 * Testnet only. The private keys are never printed.
 *
 *   pnpm tsx scripts/deploy-fresh-contract.ts                 # game.<op>, seed 42
 *   pnpm tsx scripts/deploy-fresh-contract.ts -- --name v2 --seed 42 --fund 5
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { connect, keyStores, KeyPair, utils } from "near-api-js";
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
    /* no .env */
  }
  const get = (k: string) => (text.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").trim();
  return {
    network: get("NEAR_NETWORK") || "testnet",
    operatorId: get("NEAR_OPERATOR_ACCOUNT_ID"),
    operatorKey: get("NEAR_OPERATOR_PRIVATE_KEY"),
  };
}

/** Upsert a KEY=value line in .env without touching anything else (0600). */
function writeEnvVar(key: string, value: string): void {
  const envPath = join(ROOT, ".env");
  let env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(env)) env = env.replace(re, line);
  else env += (env.endsWith("\n") || env === "" ? "" : "\n") + line + "\n";
  writeFileSync(envPath, env, { mode: 0o600 });
}

/** The season's starting coin split, straight from the simulation. */
function buildSeed(seed: number): [string, number][] {
  const world = createWorld({ seed, days: 28 });
  const entries = Object.entries(world.ledger.snapshot()) as [string, number][];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total !== TOTAL_COINS) throw new Error(`Seed sums to ${total}, expected ${TOTAL_COINS}`);
  return entries;
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

async function main() {
  const { network, operatorId, operatorKey } = readEnv();
  if (network !== "testnet") throw new Error(`NEAR_NETWORK is "${network}", expected testnet`);
  if (!operatorId || !operatorKey) throw new Error("operator id/key missing in .env");
  if (!existsSync(WASM_PATH)) throw new Error(`wasm not found — run pnpm contract:build\n  ${WASM_PATH}`);

  const label = arg("name", "game");
  const contractId = `${label}.${operatorId}`;
  const seedN = Number(arg("seed", "42"));
  const fund = arg("fund", "5"); // NEAR to endow the sub-account (code storage + state)
  const seed = buildSeed(seedN);

  const keyStore = new keyStores.InMemoryKeyStore();
  await keyStore.setKey(network, operatorId, KeyPair.fromString(operatorKey as `ed25519:${string}`));

  // A fresh key for the new contract account.
  const contractKey = KeyPair.fromRandom("ed25519");
  await keyStore.setKey(network, contractId, contractKey);

  const near = await connect({ networkId: network, nodeUrl: RPC_URL, keyStore });
  const operator = await near.account(operatorId);

  console.log(`→ Creating ${contractId} (funded ${fund} NEAR from ${operatorId}) …`);
  try {
    await operator.createAccount(
      contractId,
      contractKey.getPublicKey(),
      BigInt(utils.format.parseNearAmount(fund)!) as unknown as bigint,
    );
    // Persist the new account's key immediately (recovery), never printed.
    writeEnvVar("NEAR_CONTRACT_SUBACCOUNT_KEY", contractKey.toString());
    console.log("  sub-account created (key saved to .env)");
  } catch (e) {
    const msg = (e as { message?: string })?.message ?? String(e);
    if (/already exists|AccountAlreadyExists/i.test(msg)) {
      throw new Error(
        `${contractId} already exists. Pick another --name, or reuse it only if you still hold its key.`,
      );
    }
    throw e;
  }

  const contractAccount = await near.account(contractId);
  console.log(`→ Deploying wasm to ${contractId} …`);
  const wasm = readFileSync(WASM_PATH);
  await contractAccount.deployContract(wasm);
  console.log(`  deployed ${(wasm.length / 1024).toFixed(0)} KB`);

  console.log(`→ Seeding (seed ${seedN}, ${seed.length} accounts, operator ${operatorId}) …`);
  await contractAccount.functionCall({
    contractId,
    methodName: "new",
    args: { operator: operatorId, seed },
    gas: 100_000_000_000_000n as unknown as bigint,
    attachedDeposit: 0n as unknown as bigint,
  });

  const supply = await operator.viewFunction({ contractId, methodName: "total_supply", args: {} });
  const audited = await operator.viewFunction({ contractId, methodName: "audit_total", args: {} });
  const op = await operator.viewFunction({ contractId, methodName: "get_operator", args: {} });
  if (supply !== TOTAL_COINS || audited !== TOTAL_COINS) {
    throw new Error(`on-chain total ${supply}/${audited}, expected ${TOTAL_COINS}`);
  }

  writeEnvVar("NEAR_CONTRACT_ID", contractId);

  console.log("\nOK — fresh Millbrook ledger live on testnet");
  console.log(`  contract id : ${contractId}`);
  console.log(`  operator    : ${op}`);
  console.log(`  total supply: ${supply} coins  (audited: ${audited})`);
  console.log(`  explorer    : https://testnet.nearblocks.io/address/${contractId}`);
  console.log(`  .env        : NEAR_CONTRACT_ID + NEAR_CONTRACT_SUBACCOUNT_KEY written`);
  console.log(`\n  Next: pnpm --filter @millbrook/server settle-season -- --days 3 --seed ${seedN}`);
}

main().catch((e) => {
  console.error("✗ deploy-fresh-contract failed:", (e as { message?: string })?.message ?? e);
  process.exit(1);
});
