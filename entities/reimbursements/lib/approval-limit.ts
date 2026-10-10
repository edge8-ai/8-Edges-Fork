// Who has to approve a claim (RB.22, Dave, 2026-10-09). A claim under this
// total is approved by its check, in the same move: the checker's look is
// enough, and the approver is not asked. At or over it, the claim waits at
// checked and the approvers are told. One number, in whole VND, compared with
// the total an approval freezes; Dave's to change.
//
// Client-safe: no imports.
export const APPROVAL_LIMIT_VND = 50_000_000;

/** Whether a claim whose frozen total is `totalVnd` is approved when it is checked. */
export function approvedOnCheck(totalVnd: number): boolean {
  return totalVnd < APPROVAL_LIMIT_VND;
}
