// Who has to approve a claim (RB.22, Dave, 2026-10-09). A claim under this
// total is approved by its check, in the same move: the checker's look is
// enough, and the approver is not asked. At or over it, the claim waits at
// checked and the approvers are told. One number, in whole VND, compared with
// the total an approval freezes; Dave's to change. 5,000,000 since 2026-10-10
// (Dave): under it a claim is approved by Dave's check, at or over it Dave
// approves it as well.
//
// Client-safe: no imports.
export const APPROVAL_LIMIT_VND = 5_000_000;

/** Whether a claim whose frozen total is `totalVnd` is approved when it is checked. */
export function approvedOnCheck(totalVnd: number): boolean {
  return totalVnd < APPROVAL_LIMIT_VND;
}

// Under this total nobody looks at a claim at all (Dave, 2026-11-09): it is
// checked and approved the moment it is submitted, and goes to be paid. A
// claim with a receipt in another currency has its own limit in US dollars.
export const NO_REVIEW_LIMIT_VND = 1_000_000;
export const NO_REVIEW_LIMIT_USD = 50;

/**
 * Whether a claim coming to `totalVnd` needs no check and no approval. `usdRate`
 * is today's dollar in VND for a claim with a foreign receipt, and null for any
 * other or when no bank has one, which leaves the VND limit. A claim that comes
 * to nothing has nothing to pay, so it is not passed on.
 */
export function needsNoReview(totalVnd: number, usdRate: number | null = null): boolean {
  if (totalVnd <= 0) return false;
  return totalVnd < NO_REVIEW_LIMIT_VND || (usdRate !== null && totalVnd < NO_REVIEW_LIMIT_USD * usdRate);
}
