/**
 * Holidays and festivals (Phase-2 flavour). A weekly market day and a mid-season
 * harvest festival lift the town's appetite to spend — residents reach deeper
 * into their savings for ale, a meal or new clothes. It is demand only: coins
 * residents already hold change hands at the shops, so the 10,000-coin total is
 * never affected. Opt-in via `config.festivals` (off headless; the solo game on).
 */

import type { World } from "./types.js";
import { pushFeed } from "./engine.js";

/** The one big festival of the season (1-indexed game day). */
export const HARVEST_FESTIVAL_DAY = 25;
/** Discretionary-demand multiplier on a weekly market day. */
export const MARKET_DAY_BOOST = 1.3;
/** Discretionary-demand multiplier on the harvest festival. */
export const HARVEST_BOOST = 2;

/** The 1-indexed day the town is living through right now. */
function today(world: World): number {
  return world.day + 1;
}

/** How much today's holiday lifts discretionary spending (1 = an ordinary day). */
export function festivalFactor(world: World): number {
  if (!world.config.festivals) return 1;
  const day = today(world);
  if (day === HARVEST_FESTIVAL_DAY) return HARVEST_BOOST;
  if (day > 0 && day % 7 === 0) return MARKET_DAY_BOOST;
  return 1;
}

/** Announce a festival once, at dawn of the day it falls on. */
export function runFestivals(world: World): void {
  if (!world.config.festivals) return;
  const day = today(world);
  if (day === HARVEST_FESTIVAL_DAY) {
    pushFeed(world, "festival", "Harvest festival! The town celebrates — spending soars at the Tavern and the Tailor.", {
      day,
    });
  } else if (day > 0 && day % 7 === 0) {
    pushFeed(world, "festival", "Market day on the square — the town is out spending.", { day });
  }
}
