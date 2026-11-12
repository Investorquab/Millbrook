/**
 * Loans from the Town Hall bank (Phase-2). The Town Hall lends from its treasury
 * at a weekly interest rate; repayments go back to the Town Hall. A struggling
 * player shop is offered a loan (a decision card); the Game Master's `bank_panic`
 * event calls loans in early. Opt-in via `config.loans` (needs `decisions`).
 *
 * Only coins between the shop and the Town Hall move, so the 10,000-coin total
 * always holds. Risky Rita borrows to expand (see owners/).
 */

import { TOWN_HALL_ID } from "@millbrook/shared";
import { pushFeed } from "./engine.js";
import { humanShops } from "./decisions.js";
import type { World } from "./types.js";

/** Interest charged on the outstanding balance each week. */
export const LOAN_WEEKLY_INTEREST = 0.1;
/** The standard loan the bank offers. */
export const LOAN_OFFER_AMOUNT = 100;
/** A player shop with a till below this is offered a loan. */
export const LOAN_TILL_THRESHOLD = 40;
/** Fraction of principal a borrower repays each week (on top of interest). */
const WEEKLY_REPAYMENT = 0.2;

/**
 * Charge weekly interest + a repayment slice on outstanding loans, and offer a
 * loan to a struggling player shop. Called from the engine each day.
 */
export function runLoans(world: World): void {
  if (!world.config.loans) return;

  // Weekly: interest and a repayment slice, from the till to the Town Hall.
  if (world.day > 0 && world.day % 7 === 0) {
    for (const [wsId, principal] of [...world.loans]) {
      if (principal <= 0) {
        world.loans.delete(wsId);
        continue;
      }
      const interest = Math.max(1, Math.ceil(principal * LOAN_WEEKLY_INTEREST));
      const due = interest + Math.ceil(principal * WEEKLY_REPAYMENT);
      const paid = world.ledger.payUpTo(wsId, TOWN_HALL_ID, due);
      // Interest is a cost; only what's paid beyond it reduces the principal.
      const principalPaid = Math.max(0, paid - interest);
      const left = Math.max(0, principal - principalPaid);
      if (left <= 0) {
        world.loans.delete(wsId);
        pushFeed(world, "loan", "A Town Hall loan was repaid in full.", { workshop: wsId });
      } else {
        world.loans.set(wsId, left);
      }
    }
  }

  maybeLoanOffer(world);
}

/** Offer a loan to a struggling player shop (a decision card). */
function maybeLoanOffer(world: World): void {
  if (!world.config.decisions) return;
  for (const w of humanShops(world)) {
    if (world.loans.has(w.id)) continue;
    if (world.decisions.some((d) => d.kind === "loan" && d.workshopId === w.id)) continue;
    if (world.ledger.get(w.id) >= LOAN_TILL_THRESHOLD) continue;
    world.decisions.push({
      id: `loan_${w.id}_${world.day}`,
      kind: "loan",
      workshopId: w.id,
      title: "The bank offers a loan",
      body: `Your till is low. The Town Hall bank will lend ${LOAN_OFFER_AMOUNT} coins at ${
        LOAN_WEEKLY_INTEREST * 100
      }% a week. Take it to keep paying wages, or decline.`,
      options: [
        { id: "accept", label: `Borrow ${LOAN_OFFER_AMOUNT}`, detail: "Repaid weekly with interest." },
        { id: "decline", label: "Decline" },
      ],
      defaultOptionId: "decline",
      deadlineDay: world.day + 2,
      data: { amount: LOAN_OFFER_AMOUNT },
    });
  }
}

/** Repay up to `amount` of a shop's loan to the Town Hall. Returns coins paid. */
export function repayLoan(world: World, wsId: string, amount: number): number {
  const principal = world.loans.get(wsId) ?? 0;
  if (principal <= 0) return 0;
  const paid = world.ledger.payUpTo(wsId, TOWN_HALL_ID, Math.min(amount, principal));
  const left = Math.max(0, principal - paid);
  if (left <= 0) world.loans.delete(wsId);
  else world.loans.set(wsId, left);
  return paid;
}

/** The Game Master's `bank_panic`: loans are called in now; shops pay what they
 *  can and the rest is written off. */
export function callInLoans(world: World): void {
  for (const [wsId, principal] of [...world.loans]) {
    const paid = world.ledger.payUpTo(wsId, TOWN_HALL_ID, principal);
    world.loans.delete(wsId);
    if (paid > 0) pushFeed(world, "loan", `The bank called in a ${paid}-coin loan.`, { workshop: wsId });
  }
}
