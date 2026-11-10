/**
 * Run the Game Master job once against a sample town and print the decision and
 * receipt. Works with no keys (it falls back to town metrics + template
 * reasoning and says so); set NEAR_AI_* in .env to see live reasoning.
 *
 *   pnpm --filter @millbrook/game-master gm
 *   pnpm --filter @millbrook/game-master gm -- --unemployment 0.25 --day 20
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runGameMasterJob } from "./job.js";
import type { TownSnapshot } from "./types.js";

function readEnv(): { apiKey: string; baseUrl: string; model: string } {
  let text = "";
  try {
    text = readFileSync(join(process.cwd(), ".env"), "utf8");
  } catch {
    /* no .env — fallback path */
  }
  const get = (k: string) => (text.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").trim();
  return {
    apiKey: get("NEAR_AI_API_KEY"),
    baseUrl: get("NEAR_AI_BASE_URL") || "https://cloud-api.near.ai/v1",
    model: get("NEAR_AI_MODEL"),
  };
}

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
}

async function main() {
  const town: TownSnapshot = {
    day: arg("day", 14),
    seasonDays: 28,
    unemployment: arg("unemployment", 0.18),
    avgWage: arg("wage", 7.5),
    wheatPrice: arg("wheat", 3),
    leaderCoins: arg("leader", 2200),
    runnerUpCoins: arg("runnerup", 1200),
    daysSinceLastEvent: arg("sincelast", 8),
  };
  const env = readEnv();

  const result = await runGameMasterJob(town, { ai: env });

  console.log("── Town read ──");
  console.log(town);
  console.log(`\n── Weather ── (${result.weather.source})`);
  console.log(`  ${result.weather.tempC}°C ${result.weather.condition} — ${result.weather.label}`);
  console.log(`\n── Candidates (already capped) ── ${result.candidates.length}`);
  for (const c of result.candidates) console.log(`  • ${c.title}: ${JSON.stringify(c.params)}`);

  if (result.decision) {
    console.log(`\n── Decision ── (${result.decision.reasoningSource}${result.decision.model ? `, ${result.decision.model}` : ""})`);
    console.log(`  ${result.decision.title} — ${result.decision.effect}`);
    console.log(`  Why: ${result.decision.reasoning}`);
  } else {
    console.log("\n── Decision ── none this tick");
  }

  console.log(`\n── Receipt ── (${result.receipt.enclave})`);
  console.log(`  feedSource : ${result.receipt.feedSource}`);
  console.log(`  model      : ${result.receipt.model ?? "—"}`);
  console.log(`  attestation: ${result.receipt.attestation}`);
  console.log(`  inputsHash : ${result.receipt.inputsHash}`);
  console.log(`  decisionHash: ${result.receipt.decisionHash}`);
  console.log(`  receiptHash: ${result.receipt.receiptHash}`);

  if (result.notes.length) {
    console.log(`\n── Notes ──`);
    for (const n of result.notes) console.log(`  • ${n}`);
  }
}

main().catch((e) => {
  console.error("✗ Game Master job failed:", e?.message ?? e);
  process.exit(1);
});
