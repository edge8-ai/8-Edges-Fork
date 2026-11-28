// A receipt's warnings as a page shows them: what the AI reading stored, and what follows from
// the receipt's own columns (AD.15, design Q8). The second kind is worked out here on each read
// and never written to `ai_flags`: its facts can change after a reading, which would leave a
// stored flag stale, and the column's check constraint refuses it anyway.
//
// Client-safe: no import reaches the server.
import { paidHowOf, receiptFlagsOf, type ReceiptFlag } from "./claim-labels";

/**
 * From this value in whole VND, a receipt paid in cash is flagged: non-cash payment from this
 * figure, or the expense is not tax-deductible (CIT Law 67/2025, Decree 181/2025). The tax rule's
 * figure, which is why it is not APPROVAL_LIMIT_VND: that one is Dave's to change and says who
 * approves, and the two equal 5,000,000 only by coincidence. RECEIPT_FLAG_LABEL's words quote it.
 */
export const CASH_FLAG_FROM_VND = 5_000_000;

/**
 * A receipt's warnings, stored and worked out. A receipt nobody said how was paid, or with its
 * rate still pending, raises no cash flag: this never guesses.
 */
export function itemFlagsOf(item: { ai_flags?: unknown; paid_how?: unknown; amount_vnd?: unknown }): ReceiptFlag[] {
  const stored = receiptFlagsOf(item.ai_flags);
  const amount = item.amount_vnd === null || item.amount_vnd === undefined ? null : Number(item.amount_vnd);
  return paidHowOf(item.paid_how) === "cash" && amount !== null && amount >= CASH_FLAG_FROM_VND ? [...stored, "cash_at_limit"] : stored;
}
