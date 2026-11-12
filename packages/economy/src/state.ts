/**
 * Build the starting state of a season from a seed. Everything here is
 * deterministic: the same config always produces the same town.
 */

import {
  COOP_ID,
  PHASE1_WORKSHOPS,
  TOWN_HALL_ID,
  WORKSHOP_TYPES,
  phaseForDay,
  type RawGood,
  type WorkshopType,
} from "@millbrook/shared";
import { Rng } from "./rng.js";
import { Ledger } from "./ledger.js";
import {
  COOP_DEFAULT_WAGE,
  COOP_START_COINS,
  COOP_WORKER_COUNT,
  RAW_BASE_PRICES,
  SALES_TAX_RATE,
  SAVINGS_PER_RESIDENT,
  STARTING_RESIDENTS,
  TOWN_HALL_START_COINS,
  WAGE_TAX_RATE,
  UNEMPLOYMENT_BENEFIT,
  WORKSHOP_DEFS,
  WORKSHOP_POOL_COINS,
  BASE_WAGE,
} from "./rules.js";
import type {
  AiStrategyId,
  Coop,
  Owner,
  Resident,
  SeasonConfig,
  Trait,
  Workshop,
  World,
} from "./types.js";

const RESIDENT_NAMES = [
  "Ada", "Tom", "Mara", "Ike", "Nell", "Cole", "Rosa", "Finn", "Bea", "Hugh",
  "Lena", "Otto", "Vera", "Jack", "Mabel", "Reed", "Dora", "Silas", "Faye", "Walt",
  "Iris", "Ned", "Pearl", "Gil", "Edith", "Roy", "Myra", "Clem", "Nora", "Bram",
];

const TRAITS: Trait[] = ["thrifty", "loyal", "ambitious"];

/** Distinct names for owners whose strategy already appears in a bigger town. */
const EXTRA_OWNER_NAMES = ["Bram the Bold", "Cass Quickhand", "Odell Grey", "Petra Vane"];

/** Spare houses the town starts with beyond its residents (rent & housing). */
const HOUSE_BUFFER = 4;

/** The default owner rotation for a mixed town (player slots replace these). */
const DEFAULT_STRATEGY_ORDER: AiStrategyId[] = ["fern", "gus", "sam", "rita"];

function resolveOpenWorkshops(cfg: SeasonConfig, rng: Rng): WorkshopType[] {
  if (cfg.openWorkshops && cfg.openWorkshops.length > 0) return [...cfg.openWorkshops];
  // Always include the four Phase-1 workshops; add 0–2 Phase-2 ones at random.
  const extras = WORKSHOP_TYPES.filter((t) => !PHASE1_WORKSHOPS.includes(t));
  const extraCount = rng.int(0, 2);
  return [...PHASE1_WORKSHOPS, ...rng.sample(extras, extraCount)];
}

function splitPool(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}

export function createWorld(config: SeasonConfig): World {
  const rng = new Rng(config.seed);
  const ledger = new Ledger();

  const openWorkshops = resolveOpenWorkshops(config, rng);
  const startUnemployment = config.startUnemployment ?? 0;
  const safetyNet = config.safetyNet ?? true;
  const days = config.days;

  // ── Residents ────────────────────────────────────────────────────────────
  const residents = new Map<string, Resident>();
  for (let i = 0; i < STARTING_RESIDENTS; i++) {
    const id = `r${i}`;
    ledger.setInitial(id, SAVINGS_PER_RESIDENT);
    residents.set(id, {
      id,
      name: RESIDENT_NAMES[i] ?? `Resident ${i}`,
      trait: TRAITS[i % TRAITS.length]!,
      // A realistic spread with a modest elder tail, so when ageing is on a few
      // residents retire and the very oldest pass on within a season. Exactly one
      // rng draw (like the old 18–60), so rng order — and every non-ageing run —
      // is unchanged.
      age: rng.int(18, 70),
      retired: false,
      childUntilDay: 0,
      employerId: null,
      lastWage: 0,
      daysUnemployed: 0,
      clothLastDay: -CLOTH_SEED,
      clothesLastDay: -CLOTH_SEED,
      ateToday: false,
      hungryDays: 0,
      alive: true,
      lastReason: "New to Millbrook.",
    });
  }

  // ── Workshops and owners ──────────────────────────────────────────────────
  const workshops = new Map<string, Workshop>();
  const owners = new Map<string, Owner>();
  const pool = splitPool(WORKSHOP_POOL_COINS, openWorkshops.length);
  // When a town opens more than four shops the four AI strategies repeat; give
  // the repeats a distinct name so no two owners share one (the first four keep
  // their canonical names, so the classic four-shop town is unchanged).
  const usedNames = new Set<string>();
  let extraNameIdx = 0;

  openWorkshops.forEach((type, i) => {
    const wid = `w${i}`;
    const oid = `o${i}`;
    const def = WORKSHOP_DEFS[type];
    const coins = pool[i]!;
    ledger.setInitial(wid, coins);
    workshops.set(wid, {
      id: wid,
      type,
      ownerId: oid,
      open: true,
      price: def.defaultPrice,
      wage: BASE_WAGE,
      workers: [],
      maxWorkers: def.maxWorkers,
      outputStock: 0,
      inputStock: {},
      tools: 0,
      daysUnderpaid: 0,
      strikeDays: 0,
      bankrupt: false,
      daysBankrupt: 0,
      upForAuction: false,
      auctions: 0,
      insured: false,
      guarded: false,
      daysShortOnWages: 0,
      soldToday: 0,
      producedToday: 0,
      revenueToday: 0,
      soldYesterday: 0,
      producedYesterday: 0,
      startingCoins: coins,
    });
    const strategy: AiStrategyId = config.forceAllOwners
      ? config.forceAllOwners
      : DEFAULT_STRATEGY_ORDER[i % DEFAULT_STRATEGY_ORDER.length]!;
    let name = strategyName(strategy);
    if (usedNames.has(name)) {
      name = EXTRA_OWNER_NAMES[extraNameIdx % EXTRA_OWNER_NAMES.length]!;
      extraNameIdx += 1;
    }
    usedNames.add(name);
    owners.set(oid, {
      id: oid,
      name,
      kind: "ai",
      strategy,
      workshopId: wid,
      reputation: 0,
    });
    // Cautious owners (Fair, Steady) insure; the greedy and risky take the chance.
    workshops.get(wid)!.insured = strategy === "fern" || strategy === "sam";
  });

  // ── Co-op and Town Hall ───────────────────────────────────────────────────
  ledger.setInitial(COOP_ID, COOP_START_COINS);
  ledger.setInitial(TOWN_HALL_ID, TOWN_HALL_START_COINS);
  const rawPrices = Object.fromEntries(
    (Object.keys(RAW_BASE_PRICES) as RawGood[]).map((g) => [g, RAW_BASE_PRICES[g]]),
  ) as Record<RawGood, number>;
  const coop: Coop = { id: COOP_ID, rawPrices, workers: [], wage: COOP_DEFAULT_WAGE, revenueToday: 0, revenueYesterday: 0 };

  const world: World = {
    seed: config.seed,
    day: 0,
    phase: phaseForDay(0),
    rng,
    ledger,
    residents,
    workshops,
    owners,
    coop,
    townHall: {
      id: TOWN_HALL_ID,
      wageTaxRate: WAGE_TAX_RATE,
      salesTaxRate: SALES_TAX_RATE,
      benefit: UNEMPLOYMENT_BENEFIT,
      minimumWage: 0,
      mayor: "none",
    },
    openWorkshops,
    config: {
      seed: config.seed,
      days,
      startUnemployment,
      safetyNet,
      openWorkshops,
      forceAllOwners: config.forceAllOwners ?? null,
      gameMaster: config.gameMaster ?? false,
      ageing: config.ageing ?? false,
      auctions: config.auctions ?? false,
      elections: config.elections ?? false,
      theft: config.theft ?? false,
      fire: config.fire ?? false,
      housing: config.housing ?? false,
      festivals: config.festivals ?? false,
    },
    gm: {
      enabled: config.gameMaster ?? false,
      active: [],
      lastEventDay: Number.NEGATIVE_INFINITY,
      phase3ShockDone: false,
      log: [],
    },
    feed: [],
    metrics: [],
    unmetDemand: {},
    hallIncomeToday: 0,
    hallIncomeYesterday: 0,
    nextResidentNumber: STARTING_RESIDENTS,
    ownerRetired: false,
    // Start with room to grow, so nobody is homeless until the town booms.
    houses: STARTING_RESIDENTS + HOUSE_BUFFER,
  };

  assignInitialJobs(world, startUnemployment);
  ledger.assertInvariant(
    STARTING_RESIDENTS * SAVINGS_PER_RESIDENT + WORKSHOP_POOL_COINS + COOP_START_COINS + TOWN_HALL_START_COINS,
  );
  return world;
}

/** Seed value so residents don't all buy cloth on day 0. */
const CLOTH_SEED = 3;

function assignInitialJobs(world: World, startUnemployment: number): void {
  const residentIds = [...world.residents.keys()];
  const shuffled = world.rng.shuffle(residentIds);
  const workshopIds = [...world.workshops.keys()];

  const targetUnemployed = Math.floor(shuffled.length * startUnemployment);
  const employable = shuffled.slice(0, shuffled.length - targetUnemployed);

  let idx = 0;
  // Staff the Co-op first (its wages keep raw-material money flowing back).
  for (let c = 0; c < COOP_WORKER_COUNT && idx < employable.length; c++, idx++) {
    const rid = employable[idx]!;
    world.coop.workers.push(rid);
    world.residents.get(rid)!.employerId = world.coop.id;
  }
  // Then put two workers into each workshop as a starting crew.
  let round = 0;
  while (idx < employable.length && round < 4) {
    for (const wid of workshopIds) {
      if (idx >= employable.length) break;
      const w = world.workshops.get(wid)!;
      if (w.workers.length >= 2) continue;
      const rid = employable[idx++]!;
      w.workers.push(rid);
      world.residents.get(rid)!.employerId = wid;
    }
    round++;
  }
  // Anyone left over starts unemployed.
}

function strategyName(id: AiStrategyId): string {
  switch (id) {
    case "gus": return "Greedy Gus";
    case "fern": return "Fair Fern";
    case "sam": return "Steady Sam";
    case "rita": return "Risky Rita";
  }
}
