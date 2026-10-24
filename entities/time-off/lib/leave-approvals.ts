// Time off on the approvals primitive (S.5). A request opens an approval that
// waits on the person the approver resolver names; every decision and every
// cancellation settles it. Time off keeps its own status as the truth about the
// leave: the approval is the record of who was asked and who answered, and
// what feeds the "waiting on me" lists. A subject's answer is its latest row,
// so a reversal — withdrawn leave (A.30) — adds a row rather than editing one.
//
// Only leave-transition.ts writes through these (A.30); the admin board reads
// its deciders through the two readers at the bottom. The writers used to be
// exported from the door and each surface chose which to call after its own
// write; two of them skipped the one that mattered, so approved leave could be
// cancelled while its approval still read "approved".
//
// The approval writes never fail a leave action. By the time they run the
// leave row has already landed, and the primitive reports and audits its own
// failures (kernel/approvals/requests.ts).
import { cancelApproval, decideApproval, openApproval } from "@/kernel/approvals/requests";
import { formatDate } from "@/kernel/ui/format";
import { leadsTheOrg, type LeaveApprover } from "./approver";
import { LEAVE_TYPE_LABEL, type LeaveType } from "./leave";
import type { LeaveStatus } from "./transitions";

function span(startDate: string, endDate: string): string {
  return startDate === endDate ? formatDate(startDate) : `${formatDate(startDate)} → ${formatDate(endDate)}`;
}

/** The line the "waiting on me" lists show for a leave request. */
export function leaveApprovalLabel(r: { requesterName: string; leaveType: string; startDate: string; endDate: string }): string {
  const type = LEAVE_TYPE_LABEL[r.leaveType as LeaveType] ?? r.leaveType;
  return `${r.requesterName} · ${type} · ${span(r.startDate, r.endDate)}`;
}

/**
 * The approver kind a policy approval records (A.30). Leave approved on arrival
 * by its policy, or entered after its dates had passed, has a decided approval
 * like any other, so a later cancellation has a row to follow; it names no
 * decider, and this word is how the admin board still reads it as "auto".
 */
export const POLICY_APPROVER = "policy";

export async function openLeaveApproval(r: {
  requestId: string;
  requesterPersonId: string;
  requesterName: string;
  teamMemberId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  approver: LeaveApprover | null;
}): Promise<void> {
  // A client manager decides in the portal and an Edge8 manager on
  // /team/approvals. With no manager above them, whoever leads the organisation
  // decides their own leave, so it waits on them. Nobody resolved for anyone
  // else means the admins, who decide everything.
  const selfDecides = !r.approver && (await leadsTheOrg(r.teamMemberId));
  await openApproval({
    subjectType: "time_off",
    subjectId: r.requestId,
    requestedBy: r.requesterPersonId,
    approverPersonId: r.approver?.personId ?? (selfDecides ? r.requesterPersonId : null),
    label: leaveApprovalLabel(r),
    metadata: { teamMemberId: r.teamMemberId, approverKind: r.approver?.kind ?? (selfDecides ? "self" : null) },
  });
}

/**
 * Records the approval of leave that was born approved, so it has a decided
 * row like leave somebody decided later. An admin logging leave is its
 * decider; a policy approval names nobody and says so in `approverKind`.
 */
export async function recordLeaveBornApproved(r: {
  requestId: string;
  teamMemberId: string;
  requestedBy: string | null;
  decidedBy: string | null;
  by: "admin" | typeof POLICY_APPROVER;
  label?: string;
}): Promise<void> {
  await decideApproval({
    subjectType: "time_off",
    subjectId: r.requestId,
    state: "approved",
    decidedBy: r.decidedBy,
    requestedBy: r.requestedBy,
    label: r.label,
    metadata: { teamMemberId: r.teamMemberId, approverKind: r.by },
  });
}

/**
 * Settles a request's approval to match the status its leave row now has.
 * `decidedBy` is a people.id; an admin known only by email passes null and the
 * row still records the decision and when.
 */
export async function settleLeaveApproval(requestId: string, status: LeaveStatus, decidedBy: string | null): Promise<void> {
  const ref = { subjectType: "time_off" as const, subjectId: requestId };
  if (status === "cancelled") {
    await cancelApproval({ ...ref, cancelledBy: decidedBy });
    return;
  }
  if (status === "approved" || status === "rejected") await decideApproval({ ...ref, state: status, decidedBy });
}

/**
 * Who decided each request, as the admin board names it: the latest decision's
 * decider, oldest first in, so a request decided twice keeps its latest. A
 * policy approval is left out, because it is not a person's decision and the
 * board reads a request with no decider here as approved by policy.
 */
export function humanDeciders(
  decisions: { subject_id: string; decided_by: string | null; metadata: unknown }[],
): Map<string, string | null> {
  const byPerson = decisions.filter((d) => approverKindOf(d.metadata) !== POLICY_APPROVER);
  return new Map(byPerson.map((d) => [d.subject_id, d.decided_by]));
}

/**
 * Approved by policy, not by a person: approved_at set, no person's decision
 * among its approvals, and not imported (imported rows carry external_source).
 * Every person's decision — admin, manager or client — leaves an approval, and
 * a policy approval is left out of `humanDeciders`, so this still reads true
 * now that policy approvals write a row too (A.30).
 */
export function approvedByPolicy(
  r: { id: string; approved_at: string | null; external_source: string | null },
  deciders: Map<string, string | null>,
): boolean {
  return r.approved_at !== null && !deciders.has(r.id) && r.external_source === null;
}

/** The approver kind an approval's metadata records, or null when it records none. */
function approverKindOf(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const kind = (metadata as Record<string, unknown>).approverKind;
  return typeof kind === "string" ? kind : null;
}
