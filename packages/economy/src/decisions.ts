/**
 * Decision cards: timed choices put to a player, with a default the engine
 * applies if they don't answer in time. Opt-in via `config.decisions` (off
 * headless/determinism; the solo game and rooms turn it on). Every option only
 * moves coins between holders in town, so the 10,000-coin total always holds.
 *
 * Kinds today: a worker wage demand (accept a raise or risk a strike) and a loan
 * offer from the Town Hall bank (see loans.ts). Game Master choices layer on the
 * same queue.
 */

import { pushFeed } from "./engine.js";
import type { World, Workshop } from "./types.js";

/** The wage ceiling (mirrors WAGE_MAX in session.ts). */
const WAGE_MAX = 12;
/** How long a player has to answer a card (game days). */
const DECISION_WINDOW = 2;
/** A shop paying this far below the town average draws a wage demand. */
const DEMAND_GAP = 1;

/** Human-controlled shops (solo player, or a claimed shop in a room). */
function playerShops(world: World): Workshop[] {
  return [...world.workshops.values()].filter((w) => {
    const owner = world.owners.get(w.ownerId);
    return owner?.kind === "player" && w.open && !w.bankrupt;
  });
}

/** The average daily wage across the open shops (the strike/benchmark line). */
function averageWage(world: World): number {
  const open = [...world.workshops.values()].filter((w) => w.open && !w.bankrupt);
  if (open.length === 0) return 0;
  return open.reduce((s, w) => s + w.wage, 0) / open.length;
}

/**
 * Each day: apply any decision whose deadline has passed (its default), then
 * maybe raise a new one. Called from the engine before the day advances.
 */
export function runDecisions(world: World): void {
  if (!world.config.decisions) return;

  for (const d of [...world.decisions]) {
    if (world.day >= d.deadlineDay) applyDecision(world, d.id, d.defaultOptionId);
  }

  maybeWageDemand(world);
}

/** A player shop paying below the town average draws a wage demand — its crew
 *  (and would-be hires) want fair pay. Fires whether or not workers remain, so
 *  underpaying always surfaces the choice before the shop quietly empties. */
function maybeWageDemand(world: World): void {
  const avg = averageWage(world);
  for (const w of playerShops(world)) {
    if (world.decisions.some((d) => d.kind === "wage_demand" && d.workshopId === w.id)) continue;
    if (w.wage > avg - DEMAND_GAP) continue; // paid fairly enough
    const raise = Math.min(WAGE_MAX - w.wage, Math.ceil(avg - w.wage));
    if (raise <= 0) continue;
    const crew = w.workers.length > 0 ? "Your crew is" : "Workers say no job here is";
    world.decisions.push({
      id: `wage_${w.id}_${world.day}`,
      kind: "wage_demand",
      workshopId: w.id,
      title: "Workers want a raise",
      body: `${crew} paid ${w.wage} a day — below the town's ${avg.toFixed(0)}. Give a ${raise}-coin raise to attract and keep workers, or hold firm and risk strikes and empty benches.`,
      options: [
        { id: "accept", label: `Give the raise (+${raise})`, detail: `Wage rises to ${w.wage + raise} a day.` },
        { id: "refuse", label: "Hold firm", detail: "Workers may strike or leave if wages stay low." },
      ],
      defaultOptionId: "refuse",
      deadlineDay: world.day + DECISION_WINDOW,
      data: { raise },
    });
  }
}

/** Apply a chosen (or defaulted) option and drop the decision from the queue. */
export function applyDecision(world: World, decisionId: string, optionId: string): void {
  const d = world.decisions.find((x) => x.id === decisionId);
  if (!d) return;
  world.decisions = world.decisions.filter((x) => x.id !== decisionId);
  const w = world.workshops.get(d.workshopId);

  switch (d.kind) {
    case "wage_demand": {
      if (!w) return;
      const raise = d.data.raise ?? 0;
      if (optionId === "accept") {
        w.wage = Math.min(WAGE_MAX, w.wage + raise);
        pushFeed(world, "wage_change", `You gave your crew a ${raise}-coin raise, to ${w.wage} a day.`, {
          workshop: w.id,
        });
      } else {
        pushFeed(world, "wage_change", "You held firm on wages; the crew grumbled back to work.", { workshop: w.id });
      }
      break;
    }
    case "loan": {
      if (!w) return;
      if (optionId === "accept") {
        const amount = d.data.amount ?? 0;
        world.ledger.transfer("townhall", w.id, amount);
        world.loans.set(w.id, (world.loans.get(w.id) ?? 0) + amount);
        pushFeed(world, "loan", `You took a ${amount}-coin loan from the Town Hall bank.`, { workshop: w.id });
      } else {
        pushFeed(world, "loan", "You turned down the loan offer.", { workshop: w.id });
      }
      break;
    }
    case "gm_choice": {
      // Game Master choices carry their effect in data; handled where wired.
      const cost = d.data.cost ?? 0;
      if (w && optionId === "pay" && cost > 0) {
        world.ledger.payUpTo(w.id, "coop", cost);
      }
      break;
    }
  }
}

/** Shared with loans.ts: human-controlled shops open for business. */
export function humanShops(world: World): Workshop[] {
  return playerShops(world);
}
