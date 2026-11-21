// The one place the ledger's settlement words are spelled — and since S.11,
// that is true rather than aspirational. When this module was first written it
// converted only the two call sites involved in the collision below and left
// nine others spelling the literal, so the claim in this very sentence was
// false; a two-axis /code-review caught it. ./invoice-status.scope.test.ts now
// holds the line, because a comment cannot enforce itself.
//
// S.2 and S.8 landed in the same run and the collision check caught them
// holding two different definitions of "an invoice that is still owed", each
// written as its own string literal, in different entities:
//
//   * finance's invoice-paid asks "could this stored row still become a
//     payment?" That is a question about the STATUS, because the transition it
//     detects is a status flip. It tested `status !== "paid"`.
//   * crm's runway asks "how much money is still coming in?" That is a question
//     about the BALANCE, because runway is an amount and not a state. It tested
//     `status !== "voided"` plus a positive balance.
//
// Both questions are legitimate and they are NOT the same question, so the fix
// is not one predicate — it is one vocabulary, with the two questions named
// apart so the next reader cannot mistake one for the other. This follows the
// house pattern already set by "what counts as an open deal" in
// crm/lib/revenue-metrics/shared.ts: when two screens must not disagree, the
// test lives in one place.
//
// It also closes a real defect. `status !== "paid"` let a VOIDED invoice into
// the payment-candidate set, and a voided bill is one nobody will ever pay. A
// mirror pass that flipped such a row to paid — a cancelled invoice reinstated
// and settled in QuickBooks, or simply a status corrected there — would have
// announced `invoice.paid`, and crm's subscriber would have raised the company
// to `customer` on the strength of a cancelled bill.
//
// The comparisons are exact, not case-folded, because every existing status
// test in this repo is exact and case-folding here would quietly start
// counting a "Paid" that today counts as open. If the mirror ever sends mixed
// case that is a separate decision, made once, here.

/** The ledger says this one is settled in full. */
export const INVOICE_PAID = "paid";

/** The ledger says this one was cancelled: nobody owes it. */
export const INVOICE_VOIDED = "voided";

/** Issued, not yet due. */
export const INVOICE_OPEN = "open";

/** Issued, past its due date, still carrying a balance. */
export const INVOICE_OVERDUE = "overdue";

/**
 * Every status the ledger can hold.
 *
 * `deriveStatus` in company-os's QuickBooks mirror is the only thing that
 * PRODUCES these, and it produces exactly these four — so this list is the
 * whole vocabulary rather than a convenient subset, and the invoices filter
 * renders it in this order.
 */
export const INVOICE_STATUSES = [INVOICE_PAID, INVOICE_OPEN, INVOICE_OVERDUE, INVOICE_VOIDED] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const isPaid = (status: string | null | undefined): boolean => status === INVOICE_PAID;

export const isVoided = (status: string | null | undefined): boolean => status === INVOICE_VOIDED;

/**
 * Outstanding on paper: the ledger still shows this one as awaiting payment.
 *
 * A STATUS question, like canBecomePayment and unlike isCollectible — it is
 * what the receivables figure counts, and it deliberately says nothing about
 * how much, which is the balance's business.
 */
export const isOutstanding = (status: string | null | undefined): boolean =>
  status === INVOICE_OPEN || status === INVOICE_OVERDUE;

/**
 * Could a stored row still become a payment?
 *
 * Neither already paid — there is no transition left to make — nor voided,
 * because a cancelled bill is not going to be collected.
 *
 * This is the candidate set for detecting a transition. It is deliberately NOT
 * a claim that money is owed: how much is owed is a question about the balance,
 * and it belongs to whoever is counting cash, not to whoever is watching for a
 * state change.
 */
export const canBecomePayment = (status: string | null | undefined): boolean =>
  !isPaid(status) && !isVoided(status);

/**
 * Is this row still collectible — money the business expects to receive?
 *
 * The balance decides it, not the status: a partly-paid invoice still owes its
 * remainder while its status reads open, and the amount is the only thing that
 * can say how much. A voided row is excluded whatever its balance says, because
 * a cancelled bill's leftover balance is an artefact, not a receivable.
 *
 * Callers pass the balance they have already converted to the currency they
 * report in — this module does no FX, which is crm's shared helper's job.
 */
export const isCollectible = (
  row: { status?: string | null },
  balanceInReportingCurrency: number,
): boolean => !isVoided(row.status) && balanceInReportingCurrency > 0;
