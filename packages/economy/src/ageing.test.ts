import { describe, expect, it } from "vitest";
import { TOTAL_COINS, TOWN_HALL_ID } from "@millbrook/shared";
import { createWorld } from "./state.js";
import { stepDay } from "./engine.js";
import { runAgeing, RETIRE_AGE, DEATH_AGE, ESTATE_TAX_RATE } from "./ageing.js";
import { unemploymentRate, aliveResidents, isDependentChild, labourForce } from "./rules.js";

function newWorld(ageing: boolean, seed = 42) {
  return createWorld({ seed, days: 28, ageing });
}

describe("ageing, retirement, death and inheritance", () => {
  it("is off by default: nobody retires or dies over a season", () => {
    const world = newWorld(false);
    const startAges = [...world.residents.values()].map((r) => r.age);
    for (let i = 0; i < 28; i++) stepDay(world);
    // No ageing: ages unchanged, no one retired, everyone still alive.
    const after = [...world.residents.values()];
    expect(after.every((r) => !r.retired)).toBe(true);
    expect(after.filter((r) => r.alive).map((r) => r.age)).toEqual(
      after.filter((r) => r.alive).map((_, i) => startAges[i]),
    );
    world.ledger.assertInvariant(TOTAL_COINS);
  });

  it("ages the town a year per game week and keeps the 10,000-coin total", () => {
    const world = newWorld(true);
    const before = new Map([...world.residents].map(([id, r]) => [id, r.age]));
    for (let i = 0; i < 28; i++) {
      stepDay(world);
      world.ledger.assertInvariant(TOTAL_COINS);
    }
    // Four game weeks → everyone who lived the season is four years older.
    for (const r of world.residents.values()) {
      if (r.alive && before.has(r.id)) {
        expect(r.age).toBe((before.get(r.id) ?? 0) + 4);
      }
    }
  });

  it("retires residents at 65, out of the labour force", () => {
    const world = newWorld(true);
    for (let i = 0; i < 28; i++) stepDay(world);
    const retired = aliveResidents(world).filter((r) => r.retired);
    // With the elder seed tail, at least one resident retires in a season.
    expect(retired.length).toBeGreaterThan(0);
    for (const r of retired) {
      expect(r.age).toBeGreaterThanOrEqual(RETIRE_AGE);
      expect(r.employerId).toBeNull(); // not working
    }
    // A retiree is out of the labour force: not counted as unemployed. (Dependent
    // children are out of it too, so match the engine's definition.)
    const isChild = (r: (typeof retired)[number]) => r.childUntilDay > 0 && world.day < r.childUntilDay;
    const labour = aliveResidents(world).filter((r) => !r.retired && !isChild(r));
    const unemployed = labour.filter((r) => r.employerId === null).length;
    expect(unemploymentRate(world)).toBeCloseTo(labour.length ? unemployed / labour.length : 0, 9);
  });

  it("passes an estate to an heir, minus a 10% tax, conserving the total", () => {
    const world = newWorld(true);
    // Make exactly one resident old enough to die this week; give it a clean estate.
    const [victim, ...rest] = [...world.residents.values()];
    victim!.age = DEATH_AGE - 1; // ages to DEATH_AGE inside runAgeing
    for (const r of rest) r.age = 30; // the rest stay working-age heirs
    const estate = world.ledger.get(victim!.id);
    expect(estate).toBeGreaterThan(0);

    const hallBefore = world.ledger.get(TOWN_HALL_ID);
    world.day = 7; // a game-week boundary
    runAgeing(world);

    expect(victim!.alive).toBe(false);
    expect(world.ledger.get(victim!.id)).toBe(0);
    const expectedTax = Math.floor(estate * ESTATE_TAX_RATE);
    // The Town Hall gained the estate tax; an heir in town gained the rest.
    expect(world.ledger.get(TOWN_HALL_ID)).toBe(hallBefore + expectedTax);
    world.ledger.assertInvariant(TOTAL_COINS);
    expect(world.feed.some((e) => e.kind === "death")).toBe(true);
  });

  it("with no heir, the whole estate goes to the Town Hall", () => {
    const world = newWorld(true);
    const [victim, ...rest] = [...world.residents.values()];
    for (const r of rest) r.alive = false; // no one left to inherit
    victim!.age = DEATH_AGE - 1;
    const estate = world.ledger.get(victim!.id);
    const hallBefore = world.ledger.get(TOWN_HALL_ID);

    world.day = 7;
    runAgeing(world);

    expect(victim!.alive).toBe(false);
    expect(world.ledger.get(TOWN_HALL_ID)).toBe(hallBefore + estate);
    world.ledger.assertInvariant(TOTAL_COINS);
  });

  it("a thriving town has children, who are dependents then join the workforce", () => {
    const world = newWorld(true);
    let sawChild = false;
    for (let i = 0; i < 28; i++) {
      stepDay(world);
      world.ledger.assertInvariant(TOTAL_COINS);
      if (aliveResidents(world).some((r) => isDependentChild(r, world.day))) sawChild = true;
    }
    // At least one birth happened over a healthy season.
    expect(world.feed.some((e) => e.kind === "birth")).toBe(true);
    expect(sawChild).toBe(true);
    // Dependent children are out of the labour force (not counted as unemployed).
    for (const r of labourForce(world)) {
      expect(isDependentChild(r, world.day)).toBe(false);
    }
  });

  it("has no births when ageing is off", () => {
    const world = newWorld(false);
    for (let i = 0; i < 28; i++) stepDay(world);
    expect(world.feed.some((e) => e.kind === "birth")).toBe(false);
  });

  it("is deterministic under the same seed", () => {
    const a = newWorld(true, 7);
    const b = newWorld(true, 7);
    for (let i = 0; i < 28; i++) {
      stepDay(a);
      stepDay(b);
    }
    const snap = (w: ReturnType<typeof newWorld>) =>
      [...w.residents.values()].map((r) => `${r.id}:${r.age}:${r.retired}:${r.alive}`).sort();
    expect(snap(a)).toEqual(snap(b));
  });
});
