// Contractor requests on the approvals primitive (S.5). A submitted estimate
// and submitted work each open an approval; the decision on them settles it; a
// cancellation withdraws whatever is still pending. The work request's own
// lifecycle (work-request-lifecycle.ts) stays the truth about the request.
//
// These approvals name no approver: an Edge8 admin or the client's portal admin
// may decide, so they wait on the admins' list. "Changes requested" and
// "revision requested" answer the approval as rejected with the note as its
// reason, because the contractor's next submission opens a fresh one.
import { cancelApproval, decideApproval, openApproval } from "@/kernel/approvals/requests";
import { personIdForEmailOrNull } from "@/kernel/identity/person-by-email";

type WorkApproval = "contractor_estimate" | "contractor_work";

export async function openWorkApproval(
  subjectType: WorkApproval,
  r: { requestId: string; title: string; contractorName: string; hours: number },
): Promise<void> {
  const what = subjectType === "contractor_estimate" ? "estimate" : "work";
  await openApproval({
    subjectType,
    subjectId: r.requestId,
    requestedBy: null,
    approverPersonId: null,
    label: `${r.contractorName} · ${what} for “${r.title}” · ${r.hours}h`,
    metadata: { hours: r.hours },
  });
}

export async function settleWorkApproval(
  subjectType: WorkApproval,
  requestId: string,
  approved: boolean,
  deciderEmail: string,
  note: string,
): Promise<void> {
  await decideApproval({
    subjectType,
    subjectId: requestId,
    state: approved ? "approved" : "rejected",
    decidedBy: await personIdForEmailOrNull(deciderEmail, "portal"),
    reason: note.trim() || null,
  });
}

export async function cancelWorkApprovals(requestId: string, deciderEmail: string): Promise<void> {
  const cancelledBy = await personIdForEmailOrNull(deciderEmail, "portal");
  await cancelApproval({ subjectType: "contractor_estimate", subjectId: requestId, cancelledBy });
  await cancelApproval({ subjectType: "contractor_work", subjectId: requestId, cancelledBy });
}
