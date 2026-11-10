/**
 * M0 spike — OutLayer (runs the Game Master in a TEE enclave and returns a
 * receipt). Reads OUTLAYER_* from ./.env, confirms the key is present and that
 * the OutLayer API is reachable, and — if OUTLAYER_PROJECT is set — probes the
 * documented call path so you can see the auth response. Running a real enclave
 * job is M4; this is the connectivity + credentials check. The key is never
 * printed.
 *
 *   node scripts/spikes/outlayer.mjs
 *
 * Fallback if OutLayer slips: the Game Master runs on town metrics only and says
 * so (allowed for in the design). See docs/SETUP.md §3.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

function readEnv() {
  let text = "";
  try {
    text = readFileSync(join(process.cwd(), ".env"), "utf8");
  } catch {
    return {};
  }
  const get = (k) => (text.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").trim();
  return {
    apiKey: get("OUTLAYER_API_KEY"),
    baseUrl: get("OUTLAYER_BASE_URL") || "https://testnet-api.outlayer.ai",
    project: get("OUTLAYER_PROJECT"),
  };
}

async function main() {
  const { apiKey, baseUrl, project } = readEnv();
  if (!apiKey) {
    console.log("• OUTLAYER_API_KEY is empty — that's fine for now (the Game Master has a town-metrics fallback).");
    console.log("  To enable the enclave: sign in at https://app.outlayer.ai with the NEAR operator,");
    console.log("  create a project + payment key, then set in .env:");
    console.log("    OUTLAYER_API_KEY=...");
    console.log("    OUTLAYER_BASE_URL=https://testnet-api.outlayer.ai");
    console.log("    OUTLAYER_PROJECT=<owner>/<project>");
    console.log("  and re-run. See docs/SETUP.md §3.");
    process.exit(0);
  }

  // Reachability: any HTTP answer proves the host is up; only a network error fails.
  const auth = { Authorization: `Bearer ${apiKey}` };
  const ping = await fetch(baseUrl, { headers: auth }).catch((e) => {
    console.error(`✗ could not reach OutLayer at ${baseUrl}: ${e?.message ?? e}`);
    process.exit(1);
  });
  console.log(`✓ OutLayer reachable at ${baseUrl} (HTTP ${ping.status}).`);

  if (!project) {
    console.log("• OUTLAYER_PROJECT is empty — set it to <owner>/<project> to probe the call path.");
    console.log("✓ OK — key present and API reachable. The enclave job lands in M4.");
    return;
  }

  // Probe the documented call path; report the status for interpretation.
  const callUrl = `${baseUrl}/call/${project}`;
  const probe = await fetch(callUrl, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ ping: true }),
  }).catch((e) => {
    console.error(`✗ probing ${callUrl} failed: ${e?.message ?? e}`);
    process.exit(1);
  });
  console.log(`call path  : POST /call/${project} → HTTP ${probe.status}`);
  if (probe.status === 401 || probe.status === 403) {
    console.log("  (auth rejected — recheck OUTLAYER_API_KEY and that the project belongs to this account.)");
  } else if (probe.status === 404) {
    console.log("  (project not found — recheck OUTLAYER_PROJECT = <owner>/<project>.)");
  } else {
    console.log("  (reached the project endpoint — the real job payload is defined in M4.)");
  }
  console.log("✓ OK — key present and OutLayer reachable.");
}

main();
