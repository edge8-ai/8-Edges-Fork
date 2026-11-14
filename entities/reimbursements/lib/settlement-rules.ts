// The arithmetic of settling an advance (AD.3, design section 3). Whole VND, in
// one place, because it decides what a payment run pays: a settlement claim
// freezes payableOf, never what was spent, or the run would pay the advance out a
// second time.
//
// Client-safe: no import reaches the server.
import { approvedOnCheck } from "./approval-limit";

function wholeVnd(n: number, what: string): number {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${what} must be a whole, non-negative VND amount, not ${n}.`);
  return n;
}

/** Spent less advanced: above zero the company owes the person, below zero they owe the company. */
export function balanceOf(spentVnd: number, advancedVnd: number): number {
  return wholeVnd(spentVnd, "Spent") - wholeVnd(advancedVnd, "Advanced");
}

type SettlementOutcome = "spent_less" | "spent_exactly" | "spent_more";

export function outcomeOf(balanceVnd: number): SettlementOutcome {
  if (balanceVnd < 0) return "spent_less";
  return balanceVnd === 0 ? "spent_exactly" : "spent_more";
}

/** What the company still owes the person: the only figure a settlement claim freezes, and so the only one a run can pay. */
export function payableOf(spentVnd: number, advancedVnd: number): number {
  return Math.max(0, balanceOf(spentVnd, advancedVnd));
}

/** What the person still owes, given what has come back. Never below zero, even if the ledger were wrong. */
export function outstandingOf(balanceVnd: number, returnedVnd: number): number {
  return Math.max(0, -balanceVnd - wholeVnd(returnedVnd, "Returned"));
}

/**
 * What a settlement hears if someone tries to reject it. The money is already out, so a
 * rejection would leave an advance with no way to close.
 */
export const SETTLEMENT_NOT_REJECTED = "A settlement is never rejected, because the money is already out. Decline the receipts that are not the company's: the rest settles, and the person returns what is not covered.";
/** Sending it back would let its receipts change, and the advance has already closed on these. */
export const SETTLEMENT_ALREADY_CLOSED = "This advance has already closed on these receipts, so the settlement cannot go back. Approve it to finish.";

/**
 * Whether a settlement's check also approves it. The limit reads the new money,
 * because the approver already approved the advance (Q1): an overspend under the
 * limit is enough for the check, and at or over it the approver decides, the same
 * rule as any claim.
 */
export function settlementApprovedOnCheck(spentVnd: number, advancedVnd: number): boolean {
  return approvedOnCheck(payableOf(spentVnd, advancedVnd));
}

/**
 * What closing an advance writes, for both rows. A claim owing nothing ends in
 * `settled`, which a run never reads, so no ₫0 payment is ever created. An advance
 * the person owes money on waits at `to_return`.
 */
export function closeOf(spentVnd: number, advancedVnd: number): {
  spentVnd: number;
  balanceVnd: number;
  payableVnd: number;
  advanceStatus: "settled" | "to_return";
  claimStatus: "approved" | "settled";
} {
  const balanceVnd = balanceOf(spentVnd, advancedVnd);
  const payableVnd = payableOf(spentVnd, advancedVnd);
  return {
    spentVnd,
    balanceVnd,
    payableVnd,
    advanceStatus: balanceVnd < 0 ? "to_return" : "settled",
    claimStatus: payableVnd > 0 ? "approved" : "settled",
  };
}
