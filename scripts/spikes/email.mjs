/**
 * M0 spike — transactional email for magic-link login. Verifies the provider key
 * WITHOUT sending anything (no recipient needed, no spam). Defaults to Resend
 * (key starts with `re_`); it lists your verified domains so you know what
 * EMAIL_FROM can be. The key is never printed.
 *
 *   node scripts/spikes/email.mjs
 *
 * Login is NOT blocked without this: in dev the server prints the magic link to
 * its console instead of emailing it (see docs/SETUP.md §4).
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
  return { apiKey: get("EMAIL_API_KEY"), from: get("EMAIL_FROM") };
}

async function main() {
  const { apiKey, from } = readEnv();
  if (!apiKey) {
    console.log("• EMAIL_API_KEY is empty — that's fine for now.");
    console.log("  Dev fallback: the server prints the magic link to its console instead of emailing it.");
    console.log("  To enable real email: create a Resend key at https://resend.com (free tier),");
    console.log("  set EMAIL_API_KEY=re_... and EMAIL_FROM=<verified sender>, then re-run. See docs/SETUP.md §4.");
    process.exit(0);
  }

  if (!apiKey.startsWith("re_")) {
    console.log("• EMAIL_API_KEY is set but doesn't look like a Resend key (re_...).");
    console.log("  This spike only auto-verifies Resend; for another provider, verify via their dashboard.");
    console.log(`  Present: EMAIL_FROM=${from || "(empty)"}`);
    process.exit(0);
  }

  // Resend: GET /domains proves the key authenticates, no email sent.
  const res = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${apiKey}` },
  }).catch((e) => {
    console.error(`✗ could not reach Resend: ${e?.message ?? e}`);
    process.exit(1);
  });
  if (res.status === 401) {
    console.error("✗ Resend rejected the key (401) — recheck EMAIL_API_KEY.");
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`✗ Resend returned HTTP ${res.status}.`);
    process.exit(1);
  }
  const domains = (await res.json()).data ?? [];
  const verified = domains.filter((d) => d.status === "verified").map((d) => d.name);
  console.log(`✓ Resend key authenticates — ${domains.length} domain(s), ${verified.length} verified.`);
  if (verified.length) console.log(`  verified senders can use: login@${verified[0]}`);
  else console.log("  no verified domain yet — use Resend's test sender (onboarding@resend.dev) while developing.");
  if (!from) console.log("  → set EMAIL_FROM in .env to your sender address.");
  console.log("✓ OK — email provider reachable (no message was sent).");
}

main();
