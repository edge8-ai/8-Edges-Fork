// A checked claim's receipts are frozen in the database (A.34, migration
// 20261010030000_reimbursement_receipts_frozen_once_checked): once a claim
// leaves draft, submitted and sent back, its receipt rows cannot be added to,
// and an update may change only what a re-read writes. The check is what the
// approver's total rests on, so a receipt that changed after it would be
// frozen into an approval nobody saw.
//
// The app refuses every such write first, by the claim's status it read. The
// database is there for the write that read a status a moment before someone
// checked the claim: two people at once, or an owner's edit waiting on a bank
// for its rate. This is the sentence that write's person reads.
//
// Client-safe: no import.

/** The SQLSTATE the freeze raises (class P0, so PostgREST answers 400 with it as `code`). */
export const RECEIPT_FROZEN_CODE = "P0R01";

/** What the person reads when the claim was checked while they were working on a receipt. */
export const RECEIPT_FROZEN = "This claim was checked while you were working on it, so the receipt stays as it was. Reload to see it.";

/** Whether a write was refused by the freeze. */
export function frozenByCheck(error: { code?: string } | null | undefined): boolean {
  return error?.code === RECEIPT_FROZEN_CODE;
}

/** The message for a failed receipt write: the freeze's sentence, or the caller's own. */
export function receiptWriteError(error: { message: string; code?: string }, otherwise: string): string {
  return frozenByCheck(error) ? RECEIPT_FROZEN : otherwise;
}
