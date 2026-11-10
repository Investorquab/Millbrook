/**
 * CLI entry: `pnpm sim --seed 42 --days 28`. Plays a headless season and
 * prints the daily table and the season summary. Flags:
 *   --seed <n>        season seed (default 42)
 *   --days <n>        season length (default 28)
 *   --goal <card>     goal card for the standings (default tycoon)
 *   --all-greedy      force every owner onto Greedy Gus
 *   --all-fair        force every owner onto Fair Fern
 *   --no-safety-net   turn off benefits and public works
 *   --start-unemp <f> start with this fraction unemployed (0–1)
 *   --feed            also print the town feed
 */

import { runSeasonReport, formatReport } from "./sim.js";
import type { AiStrategyId, SeasonConfig } from "./types.js";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return fallback;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const seed = Number(arg("seed", "42"));
const days = Number(arg("days", "28"));
const goal = arg("goal", "tycoon")!;

let forceAllOwners: AiStrategyId | null = null;
if (flag("all-greedy")) forceAllOwners = "gus";
if (flag("all-fair")) forceAllOwners = "fern";

const config: SeasonConfig = {
  seed,
  days,
  forceAllOwners,
  safetyNet: !flag("no-safety-net"),
  startUnemployment: Number(arg("start-unemp", "0")),
};

const report = runSeasonReport(config, goal);
console.log(formatReport(report));

if (flag("feed")) {
  console.log("\nTown feed");
  console.log("─".repeat(40));
  for (const e of report.feed) {
    console.log(`Day ${String(e.day).padStart(2)}  [${e.kind}] ${e.text}`);
  }
}
