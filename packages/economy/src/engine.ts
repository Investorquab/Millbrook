/**
 * The simulation engine: one game day is dawn (work), noon (production), dusk
 * (wages and settlement) and night (shopping), followed by the day's
 * bookkeeping. Every coin move goes through the ledger, and the 10,000-coin
 * invariant is asserted at the end of every day.
 */

import {
  TOTAL_COINS,
  TOWN_HALL_ID,
  phaseForDay,
  type FeedEvent,
  type FeedEventKind,
  type Good,
  type RawGood,
  type Phase,
} from "@millbrook/shared";
import { strategyById, type DemandSignal } from "./owners/index.js";
import {
  runGameMaster,
  rawPriceFactor,
  outputFactor,
  workshopOutputFactor,
  demandFactor,
  breadPriceCeiling,
} from "./gamemaster.js";
import type { WeatherReading } from "./types.js";
import {
  ALE_MAX_PER_DAY,
  COOP_MAX_WORKERS,
  COOP_MIN_WORKERS,
  PUBLIC_WORKS_MAX_WORKERS,
  PUBLIC_WORKS_TRIGGER_UNEMPLOYMENT,
  PUBLIC_WORKS_WAGE,
  TARGET_SAVINGS_BY_TRAIT,
  TOWN_HALL_PUBLIC_WORKS_EMPLOYER,
  WORKSHOP_DEFS,
  aliveResidents,
  isDependentChild,
  chooseSeller,
  migrationInCount,
  needsCloth,
  needsClothes,
  outputPerWorker,
  payrollTax,
  salesTax,
  shouldMigrateOut,
  townAverageWage,
  unemploymentRate,
  updateStrike,
  reputationStep,
  REPUTATION_MIN,
  REPUTATION_MAX,
  perceivedWage,
} from "./rules.js";
import { runAgeing } from "./ageing.js";
import { runAuctions } from "./auction.js";
import { runElections, enforceMinimumWage } from "./elections.js";
import { runTheft } from "./theft.js";
import { runFire } from "./fire.js";
import { runHousing } from "./housing.js";
import type { DayMetrics, Resident, Workshop, World } from "./types.js";

// ───────────────────────────────────────────────────────────────────────────

export function pushFeed(
  world: World,
  kind: FeedEventKind,
  text: string,
  data?: FeedEvent["data"],
): void {
  world.feed.push(data ? { day: world.day, kind, text, data } : { day: world.day, kind, text });
}

function workshopTypeOpen(world: World, type: Workshop["type"]): boolean {
  for (const w of world.workshops.values()) {
    if (w.type === type && w.open && !w.bankrupt) return true;
  }
  return false;
}

function tailorOpen(world: World): boolean {
  for (const w of world.workshops.values()) {
    if (w.type === "tailor" && w.open && !w.bankrupt) return true;
  }
  return false;
}

function unemployedIds(world: World): string[] {
  return aliveResidents(world)
    .filter((r) => r.employerId === null && !r.retired && !isDependentChild(r, world.day))
    .map((r) => r.id);
}

// ── Dawn: owner decisions, labour market, public works ─────────────────────

function dawn(world: World): void {
  // Reset per-day counters and release yesterday's public-works crew.
  for (const w of world.workshops.values()) {
    w.soldToday = 0;
    w.producedToday = 0;
    w.revenueToday = 0;
  }
  for (const r of world.residents.values()) {
    if (!r.alive) continue;
    r.ateToday = false;
    if (r.employerId === TOWN_HALL_PUBLIC_WORKS_EMPLOYER) r.employerId = null;
  }
  world.coop.revenueToday = 0;

  const townAvg = townAverageWage(world);

  // Owner decisions: wage, price, target headcount.
  const targets = new Map<string, number>();
  for (const w of world.workshops.values()) {
    if (!w.open || w.bankrupt) continue;
    const owner = world.owners.get(w.ownerId);
    if (!owner || owner.strategy === null) {
      targets.set(w.id, w.workers.length);
      continue;
    }
    const strat = strategyById(owner.strategy);
    const demand: DemandSignal = {
      stock: w.outputStock,
      soldYesterday: w.soldYesterday,
      producedYesterday: w.producedYesterday,
      unmet: world.unmetDemand[WORKSHOP_DEFS[w.type].output] ?? 0,
      applicants: unemployedIds(world).length,
    };
    const ctx = { world, workshop: w, def: WORKSHOP_DEFS[w.type], townAvgWage: townAvg, demand };
    const wage = strat.decideWage(ctx);
    const price = strat.decidePrice(ctx);
    const workforce = strat.decideWorkforce(ctx);
    if (wage.value !== w.wage) {
      pushFeed(world, "wage_change", `${owner.name}'s ${w.type}: ${wage.reason}`, { workshop: w.id, wage: wage.value });
    }
    w.wage = wage.value;
    w.price = price.value;
    targets.set(w.id, Math.max(0, Math.min(workforce.value, w.maxWorkers)));
  }

  // A caring Mayor's minimum wage lifts every shop to the floor before strikes
  // and hiring react to the day's wages.
  enforceMinimumWage(world);

  // Strikes, using the wages just set.
  for (const w of world.workshops.values()) {
    if (!w.open || w.bankrupt) continue;
    const before = w.strikeDays;
    const res = updateStrike(w, world);
    if (before === 0 && w.strikeDays > 0) {
      pushFeed(world, "strike_start", `${ownerName(world, w)}'s ${w.type}: ${res.reason}`, { workshop: w.id });
    }
  }

  runCoopHiring(world);
  runLabourMarket(world, targets);
  runPublicWorks(world);
}

/**
 * The Co-op sizes its primary-sector crew (farmers, miners, woodcutters) to
 * what it earned from raw-material sales yesterday, so it stays solvent and its
 * employment rises and falls with industrial activity.
 */
function runCoopHiring(world: World): void {
  const affordable = Math.floor(world.coop.revenueYesterday / Math.max(1, world.coop.wage));
  const target = Math.max(COOP_MIN_WORKERS, Math.min(COOP_MAX_WORKERS, affordable || COOP_MIN_WORKERS));
  // Shed down to target.
  while (world.coop.workers.length > target) {
    const rid = world.coop.workers.pop()!;
    const r = world.residents.get(rid);
    if (r) {
      r.employerId = null;
      r.lastReason = "Let go from the Co-op.";
    }
  }
  // Hire the unemployed up to target.
  while (world.coop.workers.length < target) {
    const pool = unemployedIds(world);
    if (pool.length === 0) break;
    const r = world.residents.get(pool[0]!)!;
    r.employerId = world.coop.id;
    r.daysUnemployed = 0;
    r.lastReason = `Took work at the Co-op for ${world.coop.wage} a day.`;
    world.coop.workers.push(r.id);
  }
}

function ownerName(world: World, w: Workshop): string {
  return world.owners.get(w.ownerId)?.name ?? "An owner";
}

function runLabourMarket(world: World, targets: Map<string, number>): void {
  // 1) Layoffs: shed workers above target.
  for (const w of world.workshops.values()) {
    if (!w.open || w.bankrupt) continue;
    const target = targets.get(w.id) ?? w.workers.length;
    while (w.workers.length > target) {
      const rid = w.workers.pop()!;
      const r = world.residents.get(rid);
      if (r) {
        r.employerId = null;
        r.lastReason = `Laid off from the ${w.type}.`;
        pushFeed(world, "layoff", `${r.name} was laid off from ${ownerName(world, w)}'s ${w.type}.`, { resident: rid, workshop: w.id });
      }
    }
  }

  // 2) Hire the unemployed into openings. Applicants favour the best offer, and
  //    a fair owner's standing sweetens it (ruthless shops fill last).
  const openings = [...world.workshops.values()]
    .filter((w) => w.open && !w.bankrupt && w.workers.length < (targets.get(w.id) ?? 0))
    .sort((a, b) => perceivedWage(world, b) - perceivedWage(world, a));
  for (const w of openings) {
    const target = targets.get(w.id) ?? w.workers.length;
    while (w.workers.length < target) {
      const pool = unemployedIds(world);
      if (pool.length === 0) break;
      const rid = pool[0]!;
      const r = world.residents.get(rid)!;
      r.employerId = w.id;
      r.daysUnemployed = 0;
      r.lastReason = `Hired at the ${w.type} for ${w.wage} a day.`;
      w.workers.push(rid);
      pushFeed(world, "hire", `${ownerName(world, w)}'s ${w.type} hired ${r.name} at ${w.wage}.`, { resident: rid, workshop: w.id });
    }
  }

  // 3) Poaching: a worker switches for at least +1 coin a day where there's room.
  //    Workers judge the offer by its perceived wage, so a fair shop holds its
  //    people and a ruthless one bleeds them (GAME_DESIGN reputation).
  for (const r of aliveResidents(world)) {
    if (r.employerId === null) continue;
    const current = world.workshops.get(r.employerId);
    const currentWage = current ? perceivedWage(world, current) : world.coop.wage;
    let best: Workshop | null = null;
    let bestWage = currentWage;
    for (const w of world.workshops.values()) {
      if (!w.open || w.bankrupt || w.strikeDays > 0) continue;
      if (w.id === r.employerId) continue;
      if (w.workers.length >= w.maxWorkers) continue;
      const pw = perceivedWage(world, w);
      if (pw >= currentWage + 1 && pw > bestWage) {
        best = w;
        bestWage = pw;
      }
    }
    if (best) {
      // Leave the old employer.
      if (current) current.workers = current.workers.filter((id) => id !== r.id);
      else world.coop.workers = world.coop.workers.filter((id) => id !== r.id);
      best.workers.push(r.id);
      const from = current ? current.type : "Co-op";
      const fromWage = current ? current.wage : world.coop.wage;
      r.employerId = best.id;
      r.lastReason = `Left the ${from} for the ${best.type}: ${best.wage} beats ${fromWage}.`;
      pushFeed(world, "job_change", `${r.name} left the ${from} for ${ownerName(world, best)}'s ${best.type}.`, { resident: r.id, workshop: best.id });
    }
  }
}

function runPublicWorks(world: World): void {
  if (!world.config.safetyNet) return;
  if (unemploymentRate(world) <= PUBLIC_WORKS_TRIGGER_UNEMPLOYMENT) return;
  const treasury = world.ledger.get(TOWN_HALL_ID);
  const pool = unemployedIds(world);
  // Spend yesterday's tax take plus a bounded slice of the treasury, less the
  // benefit the still-jobless will draw at dusk. The slice shrinks as the
  // treasury does, so a crisis response tapers to a sustainable floor instead
  // of bankrupting the Town Hall — the treasury is a buffer, not a bottomless purse.
  const benefit = world.townHall.benefit;
  const reserveForBenefits = Math.max(0, pool.length - PUBLIC_WORKS_MAX_WORKERS) * benefit;
  const budget = world.hallIncomeYesterday + Math.floor(treasury / 15) - reserveForBenefits;
  const affordable = Math.floor(budget / Math.max(1, PUBLIC_WORKS_WAGE - benefit));
  const hireCount = Math.max(0, Math.min(pool.length, PUBLIC_WORKS_MAX_WORKERS, affordable));
  for (let i = 0; i < hireCount; i++) {
    const r = world.residents.get(pool[i]!)!;
    r.employerId = TOWN_HALL_PUBLIC_WORKS_EMPLOYER;
    r.daysUnemployed = 0;
    r.lastReason = "Hired on the town's public works.";
  }
  if (hireCount > 0) {
    pushFeed(world, "public_works", `The Town Hall put ${hireCount} resident(s) on public works.`, { count: hireCount });
  }
}

// ── Noon: production and raw-material purchasing ───────────────────────────

function sellerForInput(world: World, input: Good): Workshop | null {
  let best: Workshop | null = null;
  for (const w of world.workshops.values()) {
    if (!w.open || w.bankrupt) continue;
    if (WORKSHOP_DEFS[w.type].output !== input) continue;
    if (w.outputStock < 1) continue;
    if (!best || w.price < best.price) best = w;
  }
  return best;
}

function noon(world: World): void {
  for (const w of world.workshops.values()) {
    if (!w.open || w.bankrupt || w.strikeDays > 0 || w.workers.length === 0) continue;
    const def = WORKSHOP_DEFS[w.type];
    // Game Master effects: a heatwave cuts every worker's output; a new machine
    // lifts one workshop's. Both default to ×1 when no event is active.
    const desired =
      outputPerWorker(w, def) * outputFactor(world) * workshopOutputFactor(world, w.type);
    if (desired <= 0) continue;
    // Don't throw good money after bad: if two days of output already sit
    // unsold, skip production (and the raw-material spend) today.
    if (w.outputStock > desired * 2) {
      w.producedToday = 0;
      continue;
    }

    if (def.input) {
      const rawNeeded = desired * def.inputPerOutput;
      const have = w.inputStock[def.input] ?? 0;
      if (rawNeeded > have) {
        const toBuy = rawNeeded - have;
        const isRaw = def.input in world.coop.rawPrices;
        if (isRaw) {
          // Game Master events (drought, bumper harvest, blight, shortage) move
          // a raw good's price; the factor is 1 when none is active.
          const price =
            world.coop.rawPrices[def.input as RawGood] *
            rawPriceFactor(world, def.input as RawGood);
          const cost = Math.round(toBuy * price);
          const paid = world.ledger.payUpTo(w.id, world.coop.id, cost);
          world.coop.revenueToday += paid;
          const gotQty = price > 0 ? paid / price : toBuy;
          w.inputStock[def.input] = have + gotQty;
        } else {
          // Finished-good input (e.g. the Tailor buys cloth from the Weaver).
          const seller = sellerForInput(world, def.input);
          if (seller) {
            const price = seller.price;
            const maxUnits = Math.min(toBuy, seller.outputStock);
            const cost = Math.round(maxUnits * price);
            const paid = world.ledger.payUpTo(w.id, seller.id, cost);
            const gotQty = price > 0 ? Math.min(maxUnits, paid / price) : maxUnits;
            seller.outputStock -= gotQty;
            seller.soldToday += gotQty;
            seller.revenueToday += Math.round(gotQty * price);
            w.inputStock[def.input] = have + gotQty;
          }
        }
      }
    }

    const available = def.input ? (w.inputStock[def.input] ?? 0) : Infinity;
    const maxByInput = def.input ? available / def.inputPerOutput : Infinity;
    const produced = Math.max(0, Math.min(desired, maxByInput));
    if (def.input) {
      w.inputStock[def.input] = (w.inputStock[def.input] ?? 0) - produced * def.inputPerOutput;
    }
    w.outputStock += produced;
    w.producedToday = produced;
  }

  runToolMarket(world);
}

function runToolMarket(world: World): void {
  let smithy: Workshop | null = null;
  for (const w of world.workshops.values()) {
    if (w.type === "smithy" && w.open && !w.bankrupt) smithy = w;
  }
  if (!smithy || smithy.outputStock < 1) return;
  for (const w of world.workshops.values()) {
    if (w === smithy || !w.open || w.bankrupt) continue;
    const owner = world.owners.get(w.ownerId);
    if (!owner || owner.strategy === null || !strategyById(owner.strategy).buysTools) continue;
    if (w.tools >= w.workers.length) continue;
    const price = smithy.price;
    const comfortable = world.ledger.get(w.id) > w.wage * Math.max(1, w.workers.length) * 2 + price;
    if (!comfortable || smithy.outputStock < 1) continue;
    const paid = world.ledger.payUpTo(w.id, smithy.id, price);
    if (paid >= price) {
      w.tools += 1;
      smithy.outputStock -= 1;
      smithy.soldToday += 1;
      smithy.revenueToday += price;
    }
  }
}

// ── Dusk: wages, benefits, settlement, bankruptcy ──────────────────────────

function dusk(world: World): void {
  // Reset last wage; it is set below for anyone who earns today.
  for (const r of world.residents.values()) {
    if (r.alive) r.lastWage = 0;
  }
  world.hallIncomeToday = 0;

  for (const w of world.workshops.values()) {
    if (!w.open || w.bankrupt) continue;
    if (w.strikeDays > 0) continue; // strikers neither work nor get paid
    let short = false;
    let paidPayroll = 0;
    for (const rid of w.workers) {
      const r = world.residents.get(rid);
      if (!r) continue;
      const paid = world.ledger.payUpTo(w.id, rid, w.wage);
      r.lastWage = paid;
      paidPayroll += paid;
      if (paid < w.wage) short = true;
    }
    // Town Hall takes its cut of payroll and of the day's sales (the Mayor's rates).
    const tax =
      payrollTax(paidPayroll, world.townHall.wageTaxRate) + salesTax(w.revenueToday, world.townHall.salesTaxRate);
    world.hallIncomeToday += world.ledger.payUpTo(w.id, TOWN_HALL_ID, tax);
    w.daysShortOnWages = short ? w.daysShortOnWages + 1 : 0;
    if (w.daysShortOnWages >= 3) bankrupt(world, w);
  }

  // Co-op wages, funded by its raw-material sales, plus its payroll tax.
  let coopPayroll = 0;
  for (const rid of world.coop.workers) {
    const r = world.residents.get(rid);
    if (!r) continue;
    const paid = world.ledger.payUpTo(world.coop.id, rid, world.coop.wage);
    r.lastWage = paid;
    coopPayroll += paid;
  }
  world.hallIncomeToday += world.ledger.payUpTo(
    world.coop.id,
    TOWN_HALL_ID,
    payrollTax(coopPayroll, world.townHall.wageTaxRate),
  );

  // Public-works wages and unemployment benefit, both from the Town Hall.
  let benefitPaid = false;
  for (const r of aliveResidents(world)) {
    if (r.employerId === TOWN_HALL_PUBLIC_WORKS_EMPLOYER) {
      r.lastWage = world.ledger.payUpTo(TOWN_HALL_ID, r.id, PUBLIC_WORKS_WAGE);
    } else if (r.employerId === null && world.config.safetyNet) {
      const paid = world.ledger.payUpTo(TOWN_HALL_ID, r.id, world.townHall.benefit);
      r.lastWage = paid;
      if (paid > 0) benefitPaid = true;
    }
  }
  if (benefitPaid) pushFeed(world, "benefit_paid", `The Town Hall paid unemployment benefit.`);
}

function bankrupt(world: World, w: Workshop): void {
  w.bankrupt = true;
  w.daysBankrupt = 0;
  for (const rid of w.workers) {
    const r = world.residents.get(rid);
    if (r) {
      r.employerId = null;
      r.lastReason = `The ${w.type} went bankrupt.`;
    }
  }
  w.workers = [];
  pushFeed(world, "bankruptcy", `${ownerName(world, w)}'s ${w.type} went bankrupt.`, { workshop: w.id });
}

// ── Night: residents shop ──────────────────────────────────────────────────

type BuyResult = "bought" | "no_stock" | "cant_afford";

/** Try to buy one unit of a good within a spending ceiling. */
function buyGood(world: World, r: Resident, good: Good, ceiling: number): { result: BuyResult; price: number } {
  const seller = chooseSeller(good, world, r).value;
  if (!seller) {
    world.unmetDemand[good] = (world.unmetDemand[good] ?? 0) + 1;
    return { result: "no_stock", price: 0 };
  }
  // A railway event caps the bread price an outside baker will undercut to; the
  // resident pays the lower price and keeps the difference, so coins stay in town.
  const price = good === "bread" ? Math.min(seller.price, breadPriceCeiling(world)) : seller.price;
  if (price > ceiling || price > world.ledger.get(r.id)) {
    return { result: "cant_afford", price };
  }
  world.ledger.transfer(r.id, seller.id, price);
  seller.outputStock -= 1;
  seller.soldToday += 1;
  seller.revenueToday += price; // the Town Hall's sales-tax cut is taken at dusk
  return { result: "bought", price };
}

function night(world: World): { totalSales: number } {
  world.unmetDemand = {};
  let totalSales = 0;
  const tOpen = tailorOpen(world);
  const mealOpen = workshopTypeOpen(world, "tavern");

  for (const r of aliveResidents(world)) {
    const savings = world.ledger.get(r.id);
    const target = TARGET_SAVINGS_BY_TRAIT[r.trait];
    // Residents spend what they hold above their target savings on wants, plus
    // (for the non-thrifty) a slice of today's wage. That wage-funded slice is a
    // demand floor: even in a downturn some coins keep circulating, so the
    // brewery doesn't die and the town can climb out. Below a subsistence
    // cushion, residents spend nothing discretionary.
    const SUBSISTENCE = 20;
    const baseFromWage = r.trait === "thrifty" ? 0 : Math.floor(r.lastWage * 0.4);
    // A festival event lifts everyone's appetite to spend (demandFactor is 1 otherwise).
    let discretionary =
      savings < SUBSISTENCE
        ? 0
        : Math.floor((Math.max(0, savings - target) + baseFromWage) * demandFactor(world));

    // 1) Bread — the daily need. A need may dip into savings below the target.
    const bread = buyGood(world, r, "bread", savings);
    if (bread.result === "bought") {
      totalSales += bread.price;
      discretionary = Math.max(0, discretionary - bread.price);
      r.ateToday = true;
      r.hungryDays = 0;
      r.lastReason = "Bought today's bread.";
    } else {
      r.ateToday = false;
      r.hungryDays += 1;
      r.lastReason = bread.result === "no_stock" ? "No bread to be had today." : "Couldn't afford bread today.";
    }

    // 2) Clothes (every two weeks, if the Tailor is open) and 3) cloth (weekly).
    if (needsClothes(r, world.day, tOpen)) {
      const c = buyGood(world, r, "clothes", savings);
      if (c.result === "bought") {
        totalSales += c.price;
        discretionary = Math.max(0, discretionary - c.price);
        r.clothesLastDay = world.day;
      }
    }
    if (needsCloth(r, world.day)) {
      const c = buyGood(world, r, "cloth", savings);
      if (c.result === "bought") {
        totalSales += c.price;
        discretionary = Math.max(0, discretionary - c.price);
        r.clothLastDay = world.day;
      }
    }

    // 4) Ale — spend savings above the target, recycling wages into the town.
    for (let i = 0; i < ALE_MAX_PER_DAY && discretionary > 0; i++) {
      const a = buyGood(world, r, "ale", discretionary);
      if (a.result !== "bought") break;
      totalSales += a.price;
      discretionary -= a.price;
      r.lastReason = "Bought an ale with coins above the rainy-day fund.";
    }

    // 5) A meal out at the Tavern — an occasional treat on a good day, if one is open.
    if (mealOpen && discretionary > 0 && r.lastWage > 0) {
      const meal = buyGood(world, r, "meal", discretionary);
      if (meal.result === "bought") {
        totalSales += meal.price;
        discretionary -= meal.price;
        r.lastReason = "Treated themselves to a meal at the tavern.";
      }
    }
  }
  return { totalSales };
}

// ── End of day: migration, metrics, phase, invariant ───────────────────────

function endOfDay(world: World, totalSales: number): void {
  // Unemployment clock.
  for (const r of aliveResidents(world)) {
    if (r.employerId === null) r.daysUnemployed += 1;
    else r.daysUnemployed = 0;
  }

  // Rent and housing — rent to the Town Hall, the homeless weigh toward leaving,
  // and the Town Hall builds houses under pressure. Runs before migration-out.
  runHousing(world);

  // Strikes wind down.
  for (const w of world.workshops.values()) {
    if (w.strikeDays > 0) {
      w.strikeDays -= 1;
      if (w.strikeDays === 0) pushFeed(world, "strike_end", `Work resumed at ${ownerName(world, w)}'s ${w.type}.`, { workshop: w.id });
    }
  }

  // Migration out — coins stay in town (to the Town Hall) so the total holds.
  for (const r of aliveResidents(world)) {
    const savings = world.ledger.get(r.id);
    if (shouldMigrateOut(r, savings, world.day).value) {
      r.alive = false;
      if (r.employerId) {
        const w = world.workshops.get(r.employerId);
        if (w) w.workers = w.workers.filter((id) => id !== r.id);
        if (r.employerId === world.coop.id) world.coop.workers = world.coop.workers.filter((id) => id !== r.id);
      }
      r.employerId = null;
      if (savings > 0) world.ledger.transfer(r.id, TOWN_HALL_ID, savings);
      pushFeed(world, "migration_out", `${r.name} left Millbrook.`, { resident: r.id });
    }
  }

  // Migration in — arrivals get a small stipend from the Town Hall.
  const arrivals = migrationInCount(world, world.rng);
  for (let i = 0; i < arrivals.value; i++) {
    const id = `r${world.nextResidentNumber++}`;
    world.ledger.ensure(id);
    const stipend = world.ledger.payUpTo(TOWN_HALL_ID, id, 20);
    world.residents.set(id, {
      id,
      name: `Newcomer ${world.nextResidentNumber}`,
      trait: world.rng.pick(["thrifty", "loyal", "ambitious"]),
      age: world.rng.int(18, 50),
      retired: false,
      childUntilDay: 0,
      employerId: null,
      lastWage: stipend,
      daysUnemployed: 0,
      clothLastDay: world.day,
      clothesLastDay: world.day,
      ateToday: false,
      hungryDays: 0,
      alive: true,
      lastReason: "Arrived in Millbrook looking for work.",
    });
  }
  if (arrivals.value > 0) pushFeed(world, "migration_in", `${arrivals.value} newcomer(s) arrived in Millbrook.`, { count: arrivals.value });

  // Carry today's trade into "yesterday" for tomorrow's owner decisions.
  for (const w of world.workshops.values()) {
    w.soldYesterday = w.soldToday;
    w.producedYesterday = w.producedToday;
  }
  world.coop.revenueYesterday = world.coop.revenueToday;
  world.hallIncomeYesterday = world.hallIncomeToday;

  updateReputations(world);
  recordMetrics(world, totalSales);

  // Advance the day and note a phase change.
  const prevPhase: Phase = world.phase;
  world.day += 1;
  world.phase = phaseForDay(world.day);
  if (world.phase !== prevPhase) {
    pushFeed(world, "phase_change", `A new phase begins: ${world.phase}.`, { phase: world.phase });
  }

  // The town governs itself: a phase-boundary election may reset tax/benefit policy.
  runElections(world);

  // The living town: age the residents, retire the old, pass on estates. A no-op
  // unless ageing is on and today closes a game week; its transfers conserve, so
  // the invariant check below still holds at exactly 10,000.
  runAgeing(world);

  // Re-let the premises of any shop that has stayed bankrupt past the cooldown,
  // so the town's trade churns instead of shrinking. Conserving, so the check
  // below still holds at exactly 10,000.
  runAuctions(world);

  // Petty theft when the town is struggling — loses goods, never coins.
  runTheft(world);

  // Fire and insurance — destroys goods; premiums/claims move coins shop↔pool.
  runFire(world);

  world.ledger.assertInvariant(TOTAL_COINS);
}

/** Drift every owner's reputation by the day's behaviour (pay, layoffs, strikes).
 *  Runs before the day advances, so today's layoff feed lines (e.day === world.day)
 *  are the ones that count. Nothing in the sim reads reputation to decide yet. */
function updateReputations(world: World): void {
  const laidOffToday = new Set<string>();
  for (const e of world.feed) {
    if (e.day === world.day && e.kind === "layoff" && e.data?.workshop) {
      laidOffToday.add(String(e.data.workshop));
    }
  }
  for (const w of world.workshops.values()) {
    const owner = world.owners.get(w.ownerId);
    if (!owner) continue;
    const { value: delta } = reputationStep(world, w, { laidOffToday: laidOffToday.has(w.id) });
    owner.reputation = Math.max(REPUTATION_MIN, Math.min(REPUTATION_MAX, owner.reputation + delta));
  }
}

function recordMetrics(world: World, totalSales: number): void {
  const alive = aliveResidents(world);
  const employed = alive.filter((r) => r.employerId !== null);
  const wages = employed.map((r) => r.lastWage).filter((w) => w > 0);
  const avgWage = wages.length ? wages.reduce((a, b) => a + b, 0) / wages.length : 0;

  let ownersCoins = 0;
  for (const w of world.workshops.values()) ownersCoins += world.ledger.get(w.id);
  let residentsCoins = 0;
  for (const r of alive) residentsCoins += world.ledger.get(r.id);

  const m: DayMetrics = {
    day: world.day,
    phase: world.phase,
    population: alive.length,
    employed: employed.length,
    unemployment: alive.length ? (alive.length - employed.length) / alive.length : 0,
    avgWage,
    totalSales,
    ownersCoins,
    residentsCoins,
    coopCoins: world.ledger.get(world.coop.id),
    townHallCoins: world.ledger.get(TOWN_HALL_ID),
  };
  world.metrics.push(m);
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Run one whole game day in place. Pass a `weather` reading to let the Game
 *  Master act on a live feed; it falls back to a derived reading otherwise. The
 *  Game Master is inert unless `config.gameMaster` is on. */
export function stepDay(world: World, weather?: WeatherReading): void {
  const fired = runGameMaster(world, weather);
  if (fired) {
    pushFeed(world, "gm_event", `Game Master: ${fired.title} — ${fired.effect}`, {
      id: fired.id,
      source: fired.source,
    });
  }
  dawn(world);
  noon(world);
  dusk(world);
  const { totalSales } = night(world);
  endOfDay(world, totalSales);
}

/** Run `days` game days (defaults to the configured season length). */
export function runSeason(world: World, days = world.config.days): World {
  for (let d = 0; d < days; d++) stepDay(world);
  return world;
}
