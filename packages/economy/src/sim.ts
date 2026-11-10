/**
 * Headless season runner and report. `runSeasonReport` plays a whole season
 * and returns the daily metrics plus a summary; `formatReport` renders the
 * table the CLI prints. This is what `pnpm sim --seed 42 --days 28` drives and
 * what the AI judges can run to check the economy.
 */

import { createWorld } from "./state.js";
import { runSeason } from "./engine.js";
import { standings } from "./scoring.js";
import type { DayMetrics, SeasonConfig, World } from "./types.js";
import type { FeedEvent } from "@millbrook/shared";

export interface SeasonReport {
  seed: number;
  days: number;
  metrics: DayMetrics[];
  feed: FeedEvent[];
  summary: {
    finalPopulation: number;
    finalUnemployment: number;
    avgUnemployment: number;
    avgWage: number;
    totalSalesOverSeason: number;
    ownersCoins: number;
    residentsCoins: number;
    coopCoins: number;
    townHallCoins: number;
    strikes: number;
    bankruptcies: number;
    migrationsOut: number;
    migrationsIn: number;
  };
  standings: ReturnType<typeof standings>;
  world: World;
}

export function runSeasonReport(config: SeasonConfig, goalCard = "tycoon"): SeasonReport {
  const world = createWorld(config);
  runSeason(world);
  const metrics = world.metrics;
  const count = (kind: FeedEvent["kind"]) => world.feed.filter((e) => e.kind === kind).length;
  const avg = (sel: (m: DayMetrics) => number) =>
    metrics.length ? metrics.reduce((a, m) => a + sel(m), 0) / metrics.length : 0;
  const last = metrics.at(-1);

  return {
    seed: config.seed,
    days: config.days,
    metrics,
    feed: world.feed,
    summary: {
      finalPopulation: last?.population ?? 0,
      finalUnemployment: last?.unemployment ?? 0,
      avgUnemployment: avg((m) => m.unemployment),
      avgWage: avg((m) => m.avgWage),
      totalSalesOverSeason: metrics.reduce((a, m) => a + m.totalSales, 0),
      ownersCoins: last?.ownersCoins ?? 0,
      residentsCoins: last?.residentsCoins ?? 0,
      coopCoins: last?.coopCoins ?? 0,
      townHallCoins: last?.townHallCoins ?? 0,
      strikes: count("strike_start"),
      bankruptcies: count("bankruptcy"),
      migrationsOut: count("migration_out"),
      migrationsIn: count("migration_in"),
    },
    standings: standings(world, goalCard),
    world,
  };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(0)}%`.padStart(4);
}

export function formatReport(report: SeasonReport): string {
  const lines: string[] = [];
  lines.push(`Millbrook season — seed ${report.seed}, ${report.days} days`);
  lines.push("");
  lines.push("Day  Phase        Pop  Emp  Unemp  AvgWage  Sales  Owners  Resid  Coop  Hall");
  lines.push("─".repeat(80));
  for (const m of report.metrics) {
    lines.push(
      [
        String(m.day).padStart(3),
        m.phase.padEnd(12),
        String(m.population).padStart(3),
        String(m.employed).padStart(3),
        pct(m.unemployment),
        m.avgWage.toFixed(1).padStart(7),
        String(m.totalSales).padStart(5),
        String(m.ownersCoins).padStart(6),
        String(m.residentsCoins).padStart(5),
        String(m.coopCoins).padStart(5),
        String(m.townHallCoins).padStart(5),
      ].join("  "),
    );
  }
  const s = report.summary;
  lines.push("");
  lines.push("Season summary");
  lines.push("─".repeat(40));
  lines.push(`Final population      ${s.finalPopulation}`);
  lines.push(`Final unemployment    ${pct(s.finalUnemployment).trim()}`);
  lines.push(`Average unemployment  ${pct(s.avgUnemployment).trim()}`);
  lines.push(`Average wage          ${s.avgWage.toFixed(1)}`);
  lines.push(`Total sales           ${s.totalSalesOverSeason}`);
  lines.push(`Strikes / bankruptcies ${s.strikes} / ${s.bankruptcies}`);
  lines.push(`Migrations in / out   ${s.migrationsIn} / ${s.migrationsOut}`);
  lines.push(`Coins — owners ${s.ownersCoins}, residents ${s.residentsCoins}, co-op ${s.coopCoins}, hall ${s.townHallCoins}`);
  lines.push(`Total (must be 10,000): ${s.ownersCoins + s.residentsCoins + s.coopCoins + s.townHallCoins}`);
  lines.push("");
  lines.push("Standings (Tycoon — most profit)");
  lines.push("─".repeat(40));
  report.standings.forEach((st, i) => {
    lines.push(`${i + 1}. ${st.ownerName.padEnd(14)} ${st.workshopType.padEnd(10)} ${st.detail}`);
  });
  return lines.join("\n");
}
