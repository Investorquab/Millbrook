/**
 * M0 spike — NEAR AI Cloud (the Game Master's reasoning, the Gazette, Foreman).
 * Reads NEAR_AI_* from ./.env, lists the available models, then runs one small
 * OpenAI-compatible chat completion and reports whether the response carries the
 * hardware-signed proof we surface in the Proof panel. The API key is never
 * printed.
 *
 *   node scripts/spikes/near-ai.mjs
 *
 * Needs NEAR_AI_API_KEY in .env (see docs/SETUP.md §2). cloud.near.ai is prepaid,
 * so an unfunded account returns HTTP 402 — that's a billing step, not a bad key.
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
    baseUrl: get("NEAR_AI_BASE_URL") || "https://cloud-api.near.ai/v1",
    apiKey: get("NEAR_AI_API_KEY"),
    model: get("NEAR_AI_MODEL"),
  };
}

function explainStatus(status) {
  if (status === 401) return "the key is present but rejected (401) — recheck NEAR_AI_API_KEY.";
  if (status === 402) return "the key works but the account is unfunded (402) — add credits / stake at cloud.near.ai.";
  if (status === 404) return "endpoint not found (404) — recheck NEAR_AI_BASE_URL.";
  return `HTTP ${status}.`;
}

async function main() {
  const { baseUrl, apiKey, model } = readEnv();
  if (!apiKey) {
    console.error("✗ NEAR_AI_API_KEY is empty in .env.");
    console.error("  Get one at https://cloud.near.ai → Developer Dashboard → API Keys (starts with sk-),");
    console.error("  put it in .env as NEAR_AI_API_KEY=sk-..., then re-run this spike. See docs/SETUP.md §2.");
    process.exit(1);
  }
  const auth = { Authorization: `Bearer ${apiKey}` };

  // 1) List models — proves the key authenticates and shows what to put in NEAR_AI_MODEL.
  const modelsRes = await fetch(`${baseUrl}/models`, { headers: auth }).catch((e) => {
    console.error(`✗ could not reach ${baseUrl}: ${e?.message ?? e}`);
    process.exit(1);
  });
  if (!modelsRes.ok) {
    console.error(`✗ listing models failed: ${explainStatus(modelsRes.status)}`);
    process.exit(1);
  }
  const models = (await modelsRes.json()).data?.map((m) => m.id) ?? [];
  console.log(`✓ key authenticates — ${models.length} models available.`);

  let useModel = model;
  if (!useModel) {
    useModel = models.find((m) => /deepseek|glm|llama|qwen/i.test(m)) ?? models[0];
    console.log(`• NEAR_AI_MODEL is empty — suggest: ${useModel}`);
    console.log(`  (a few options: ${models.slice(0, 6).join(", ")}${models.length > 6 ? ", …" : ""})`);
  }
  if (!useModel) {
    console.error("✗ no models available on this account.");
    process.exit(1);
  }

  // 2) One tiny completion — proves end-to-end reasoning + checks for the proof.
  const chatRes = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({
      model: useModel,
      messages: [
        { role: "system", content: "You are Millbrook's Game Master. Answer in one short sentence." },
        { role: "user", content: "A drought hit the wheat fields. Name one fair event for a closed 10,000-coin town." },
      ],
      max_tokens: 60,
    }),
  });
  if (!chatRes.ok) {
    console.error(`✗ chat completion failed: ${explainStatus(chatRes.status)}`);
    // Surface the server's own message — a 402 can mean "unfunded" OR
    // "no spending limit configured", which is a different dashboard step.
    const detail = await chatRes.text().catch(() => "");
    const msg = (() => {
      try { return JSON.parse(detail)?.error?.message; } catch { return ""; }
    })();
    if (msg) console.error(`  server says: ${msg}`);
    if (/spending limit|no_limit_configured/i.test(detail))
      console.error("  → In the cloud.near.ai dashboard, set a spending limit / budget for this key (not just add credits).");
    process.exit(1);
  }
  const chat = await chatRes.json();
  const reply = chat.choices?.[0]?.message?.content?.trim() ?? "(no content)";
  const proof = chat.signature || chat.proof || chat.attestation || chat.response_hash;
  console.log(`model      : ${useModel}`);
  console.log(`reply      : ${reply}`);
  console.log(`proof      : ${proof ? "present (surfaced in the Proof panel)" : "not in this response (check the response headers in M4)"}`);
  console.log("✓ OK — NEAR AI Cloud works end to end.");
  if (!model) console.log(`\n→ Add to .env:  NEAR_AI_MODEL=${useModel}`);
}

main();
