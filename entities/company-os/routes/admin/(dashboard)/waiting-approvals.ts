// The approvals half of "Waiting on you" on the Admin Home (S.5, AH.2.3):
// every approval that names this admin, names a permission they hold (RB.3),
// or names nobody, read from the approvals primitive, oldest first. It lists
// and links; each flow's own screen is still where the decision is made, with
// its own rules. The other half, the reviews the admin writes, comes from the
// team door; lib/admin-home.ts puts the two together.
//
// It is never a side door (ADR 0013): an approval is listed only when the admin
// may open the screen it is decided on, by that screen's declared permission.
// Closed by default, so an approval with no screen here is not listed either.
// A failed read throws, and the Home says the card failed: an empty card would
// read as "nothing needs you".
import { waitingOn } from "@/kernel/approvals/waiting";
import { APPROVAL_SUBJECTS } from "@/kernel/approvals/vocabulary";
import { decideHrefs } from "@/kernel/approvals/presentation";
import { getAccess } from "@/kernel/identity/access-request";
import { mayOpen } from "@/kernel/identity/may-open";
import { personIdForEmail } from "@/kernel/identity/person-by-email";

export type WaitingApprovalRow = { id: string; label: string; kind: string; createdAt: string; href: string };

export async function waitingApprovals(email: string): Promise<WaitingApprovalRow[]> {
  const [personId, access] = await Promise.all([personIdForEmail(email), getAccess()]);
  // The permissions come from the access this render already resolved, so an
  // approval addressed to a role reaches the admins who hold it, and only them.
  const waiting = await waitingOn(personId, { admin: true, permissions: access?.permissions() ?? [] });
  return waiting.flatMap((approval) => {
    // Where each kind is decided, Admin's pages first (kernel/approvals/presentation):
    // a claim's checker whom Admin's claim page does not reach goes to the Team
    // view's checker page, an approver to the To approve list
    // (app/__tests__/waiting-on-you.test.tsx).
    const href = decideHrefs(approval, "admin").find((h) => mayOpen(access, h));
    return href
      ? [{ id: approval.id, label: approval.label, kind: APPROVAL_SUBJECTS[approval.subjectType], createdAt: approval.createdAt, href }]
      : [];
  });
}
