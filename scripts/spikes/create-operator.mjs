/**
 * M0 spike — create the NEAR testnet operator account.
 *
 * Generates an ed25519 key pair, asks the testnet faucet to create a named
 * account funded with test NEAR, then saves the key to the standard NEAR
 * credentials store and writes the account id + private key into ./.env.
 *
 * The private key is NEVER printed to the console or logs — only the account id
 * and the public key are shown. Testnet only; this spends nothing real.
 *
 *   node scripts/spikes/create-operator.mjs [account-id.testnet]
 *
 * Default account id: millbrook.testnet
 */

import { KeyPair } from "near-api-js";
import { writeFileSync, mkdirSync, readFileSync, existsSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const FAUCET_URL = "https://helper.nearprotocol.com/account";
const RPC_URL = "https://test.rpc.fastnear.com";
const NETWORK = "testnet";

const accountId = (process.argv[2] ?? "millbrook.testnet").trim();
if (!accountId.endsWith(".testnet")) {
  console.error(`✗ Account id must end in .testnet (got "${accountId}")`);
  process.exit(1);
}

async function rpcViewAccount(id) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "1",
      method: "query",
      params: { request_type: "view_account", finality: "final", account_id: id },
    }),
  });
  const json = await res.json();
  return json.result ?? null;
}

async function main() {
  // 0) Already exists?
  const existing = await rpcViewAccount(accountId).catch(() => null);
  if (existing && typeof existing.amount === "string") {
    console.error(
      `✗ ${accountId} already exists on ${NETWORK} (balance ${(Number(existing.amount) / 1e24).toFixed(2)} NEAR).\n` +
        `  Pick another name, e.g.  node scripts/spikes/create-operator.mjs millbrookgame.testnet`,
    );
    process.exit(1);
  }

  // 1) Generate the key pair.
  const keyPair = KeyPair.fromRandom("ed25519");
  const publicKey = keyPair.getPublicKey().toString(); // ed25519:...
  const privateKey = keyPair.toString(); // ed25519:...  (secret — never logged)

  // 2) Ask the faucet to create the account with our public key.
  const res = await fetch(FAUCET_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: publicKey }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`✗ Faucet refused to create ${accountId} (HTTP ${res.status}). ${text.slice(0, 200)}`);
    console.error(`  The name may be taken. Try another, e.g. millbrookgame.testnet`);
    process.exit(1);
  }

  // 3) Verify it landed on chain (poll a few times).
  let ok = false;
  for (let i = 0; i < 10; i++) {
    const acc = await rpcViewAccount(accountId).catch(() => null);
    if (acc && typeof acc.amount === "string") {
      ok = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!ok) {
    console.error(`✗ Account was requested but did not appear on chain in time. Check https://testnet.nearblocks.io/address/${accountId}`);
    process.exit(1);
  }

  // 4) Save to the standard NEAR credentials store (~/.near-credentials/testnet/).
  const credDir = join(homedir(), ".near-credentials", NETWORK);
  mkdirSync(credDir, { recursive: true });
  const credPath = join(credDir, `${accountId}.json`);
  writeFileSync(
    credPath,
    JSON.stringify({ account_id: accountId, public_key: publicKey, private_key: privateKey }, null, 2),
    { mode: 0o600 },
  );

  // 5) Write into ./.env (create from .env.example if missing). Never print the key.
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath) && existsSync(join(process.cwd(), ".env.example"))) {
    writeFileSync(envPath, readFileSync(join(process.cwd(), ".env.example")));
  }
  let env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const setVar = (key, value) => {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(env)) env = env.replace(re, line);
    else env += (env.endsWith("\n") || env === "" ? "" : "\n") + line + "\n";
  };
  setVar("NEAR_NETWORK", NETWORK);
  setVar("NEAR_OPERATOR_ACCOUNT_ID", accountId);
  setVar("NEAR_OPERATOR_PRIVATE_KEY", privateKey);
  writeFileSync(envPath, env, { mode: 0o600 });

  console.log("OK — operator account created on testnet");
  console.log(`  account id : ${accountId}`);
  console.log(`  public key : ${publicKey}`);
  console.log(`  explorer   : https://testnet.nearblocks.io/address/${accountId}`);
  console.log(`  key saved  : ${credPath} (private key NOT printed)`);
  console.log(`  .env       : NEAR_OPERATOR_ACCOUNT_ID and NEAR_OPERATOR_PRIVATE_KEY written`);
}

main().catch((e) => {
  console.error("✗ Unexpected error:", e?.message ?? e);
  process.exit(1);
});
