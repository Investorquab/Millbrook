import { describe, expect, it } from "vitest";
import { TOTAL_COINS } from "@millbrook/shared";
import { SoloSession } from "./session.js";
import { repayLoan } from "./loans.js";
import type { Decision } from "./types.js";

function session(seed = 42) {
  return new SoloSession({ seed, days: 28 });
}

/** A decision targeting the player's shop, with sensible defaults. */
function card(ws: string, over: Partial<Decision>): Decision {
  return {
    id: "d1",
    kind: "wage_demand",
    workshopId: ws,
    title: "",
    body: "",
    options: [],
    defaultOptionId: "refuse",
    deadlineDay: 99,
    data: {},
    ...over,
  };
}

describe("decision cards", () => {
  it("accepting a wage demand raises the wage and conserves 10,000", () => {
    const s = session();
    const ws = s.playerWorkshopId;
    const before = s.world.workshops.get(ws)!.wage;
    s.world.decisions.push(card(ws, { id: "wage1", kind: "wage_demand", data: { raise: 2 } }));
    s.decide("wage1", "accept");
    expect(s.world.workshops.get(ws)!.wage).toBe(before + 2);
    expect(s.pendingDecisions().some((d) => d.id === "wage1")).toBe(false);
    s.world.ledger.assertInvariant(TOTAL_COINS);
  });

  it("a loan accept moves coins Town Hall → shop, and repayment moves them back", () => {
    const s = session();
    const ws = s.playerWorkshopId;
    const tillBefore = s.world.ledger.get(ws);
    s.world.decisions.push(card(ws, { id: "loan1", kind: "loan", defaultOptionId: "decline", data: { amount: 100 } }));
    s.decide("loan1", "accept");
    expect(s.world.ledger.get(ws)).toBe(tillBefore + 100);
    expect(s.world.loans.get(ws)).toBe(100);
    s.world.ledger.assertInvariant(TOTAL_COINS);

    const repaid = repayLoan(s.world, ws, 40);
    expect(repaid).toBe(40);
    expect(s.world.loans.get(ws)).toBe(60);
    s.world.ledger.assertInvariant(TOTAL_COINS);
  });

  it("an unanswered decision resolves to its default once the deadline passes", () => {
    const s = session();
    const ws = s.playerWorkshopId;
    const before = s.world.workshops.get(ws)!.wage;
    // A wage demand that's already past its deadline → the engine applies the
    // default (refuse) on the next step, so the wage is unchanged and it clears.
    s.world.decisions.push(card(ws, { id: "wd", kind: "wage_demand", deadlineDay: 0, data: { raise: 3 } }));
    s.step();
    expect(s.pendingDecisions().some((d) => d.id === "wd")).toBe(false);
    expect(s.world.workshops.get(ws)!.wage).toBe(before); // default refused it
  });

  it("the generator raises a wage demand for an underpaid shop; accepting lifts the wage", () => {
    const s = session();
    const ws = s.playerWorkshopId;
    s.setWage(5);
    let demand: Decision | undefined;
    for (let i = 0; i < 4 && !demand; i++) {
      s.step();
      demand = s.world.decisions.find((d) => d.kind === "wage_demand" && d.workshopId === ws);
    }
    expect(demand, "a wage demand should fire within a few days").toBeTruthy();
    const before = s.world.workshops.get(ws)!.wage;
    s.decide(demand!.id, "accept");
    expect(s.world.workshops.get(ws)!.wage).toBeGreaterThan(before);
  });

  it("the 10,000-coin total holds all season with decisions and loans on", () => {
    for (const seed of [42, 1, 7]) {
      const s = session(seed);
      for (let i = 0; i < 28; i++) {
        s.step();
        s.world.ledger.assertInvariant(TOTAL_COINS);
      }
    }
  });
});
