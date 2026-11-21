// The one step that moves a leave request (A.30): the write, the approval that
// records it, and the fact the bus states — together, so no surface can do one
// without the others.
//
// Four surfaces decide leave (the admin screen, an Edge8 manager's approvals
// page, a client manager in the portal, the employee's own page) and two create
// it (an admin logging it, an employee requesting it). Each used to write the
// status itself and then pick which helpers to call after, and two picks were
// wrong: an admin denying approved leave left the subject with an approved and
// a rejected approval, and cancelling approved leave left its approval reading
// "approved" with nothing on the bus to say otherwise.
//
// What stays with the caller is authorization. Every server action keeps its
// guard inline (ADR-0007), and the scope check stays beside the query that
// enforces it: the caller hands this module its own writer, already filtered to
// the row it may touch — the employee's to their own leave, the admin's to any.
// This module adds the status it read to that write, so a request somebody else
// moved in between matches nothing, and a write that matched nothing records
// and announces nothing.
//
// time_off.status is the truth about the leave. The approval is the history of
// who was asked and who answered; its writes never fail a move that landed,
// because the primitive reports and audits its own failures, and
// `npm run audit:leave-approvals` lists any leave the two disagree on.
import type { Result } from "@/kernel/data/result";
import type { LeaveApprover } from "./approver";
import { announceLeaveApproved, announceLeaveCreated, announceLeaveWithdrawn } from "./leave-events";
import { leaveApprovalLabel, openLeaveApproval, POLICY_APPROVER, recordLeaveBornApproved, settleLeaveApproval } from "./leave-approvals";
import { nextLeaveStatus, type DecidedLeave, type LeaveActor, type LeaveDecision, type LeaveStatus } from "./transitions";
import { updateTimeOff } from "./writes";

/**
 * What a write answers, as PostgREST does: the rows it matched and the
 * database's refusal. Both seams below take this shape, so an adapter over a
 * builder is the builder itself.
 */
type WriteAnswer<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;

/**
 * The caller's scoped update of one leave row. It must already be filtered to
 * the row and to what the caller may touch; this module adds `.eq("status",
 * from)` to it through `from`, and reads a landed write from the rows it
 * returns, so it must end in `.select("id")`.
 */
export type LeaveWriter = (patch: { status: LeaveStatus; approved_at?: string }, from: LeaveStatus) => WriteAnswer<unknown[]>;

/** The leave row as the caller read it, with the fields the facts carry. */
export type LeaveRow = DecidedLeave & { status: LeaveStatus };

/** The columns a caller selects so it can hand the row to `transitionLeave`. */
export const LEAVE_ROW_COLUMNS = "status, team_member_id, start_date, end_date, leave_type";

/** The leave row as time_off spells it, turned into the one this step reads. */
export function leaveRowFrom(
  id: string,
  r: { status: string; team_member_id: string; start_date: string; end_date: string; leave_type: string },
): LeaveRow {
  return { id, status: r.status as LeaveStatus, teamMemberId: r.team_member_id, startDate: r.start_date, endDate: r.end_date, leaveType: r.leave_type };
}

/**
 * The writer for one row, for a caller that may touch any leave (an admin, a
 * manager or a client manager, each checked before this). `ownedBy` narrows it
 * to one person's own leave, in the query that writes, for the employee's
 * cancel button — whose check is literal self-ownership, not self-or-reports.
 */
export function timeOffWriter(id: string, ownedBy?: { teamMemberId: string }): LeaveWriter {
  return (patch, from) => {
    const one = updateTimeOff(patch).eq("id", id);
    return (ownedBy ? one.eq("team_member_id", ownedBy.teamMemberId) : one).eq("status", from).select("id");
  };
}

// What a surface says when its write matched nothing. An Edge8 or client
// manager only ever decides a pending request, so for them the only thing that
// can have happened is a decision; the others may have raced any move.
function lostRace(actor: LeaveActor, decision: LeaveDecision): string {
  if (actor === "manager" || actor === "client-manager") return "This request has already been decided.";
  return decision === "cancelled"
    ? "This request changed while you were cancelling it. Reload and try again."
    : "This request changed while you were deciding. Reload and try again.";
}

/**
 * Moves a request: approve, deny or cancel it. Refused by the transition rules
 * or by a lost write, it changes nothing; a no-op answers ok without writing.
 * Once the write lands the approval records it (a reversal is appended, never
 * edited over) and the bus states what the move meant: `leave.approved`, or
 * `leave.withdrawn` when approved leave became cancelled or rejected.
 */
export async function transitionLeave(input: {
  row: LeaveRow;
  decision: LeaveDecision;
  actor: LeaveActor;
  write: LeaveWriter;
  /** people.id of whoever is moving it, or null when they cannot be named. */
  decidedBy: string | null;
}): Promise<Result> {
  const { row, decision, actor, decidedBy } = input;
  const next = nextLeaveStatus(row.status, decision, actor);
  if (next.outcome === "refuse") return { ok: false, error: next.error };
  if (next.outcome === "noop") return { ok: true };

  // A decision stamps when it was taken; a cancellation leaves that alone, so
  // withdrawn leave still says when it had been approved.
  const patch = decision === "cancelled" ? { status: next.status } : { status: next.status, approved_at: new Date().toISOString() };
  const { data: landed, error } = await input.write(patch, row.status);
  if (error) return { ok: false, error: error.message };
  if (!landed?.length) return { ok: false, error: lostRace(actor, decision) };

  await settleLeaveApproval(row.id, next.status, decidedBy);
  await announceLeaveApproved(next, row, decidedBy);
  await announceLeaveWithdrawn(row.status, next, row, decidedBy);
  return { ok: true };
}

/** The leave a request carries, as the surface that files it settled it. */
export type NewLeave = {
  teamMemberId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  days: number;
  reason: string | null;
};

/** The row to insert, as the time_off table spells it. */
export type NewLeaveRow = {
  team_member_id: string;
  leave_type: string;
  status: LeaveStatus;
  approved_at: string | null;
  start_date: string;
  end_date: string;
  is_half_day: boolean;
  days: number;
  reason: string | null;
};

/**
 * How a request arrives. `requested` waits on the approver the caller resolved
 * (null leaves it to the admins, or to the requester when they lead the
 * organisation). `approved` is born decided: logged by an admin, who is its
 * decider, or approved by policy — the requester's policy auto-approves, or its
 * dates had already passed — which names nobody.
 */
export type LeaveArrival =
  | { status: "requested"; requester: { personId: string; name: string }; approver: LeaveApprover | null }
  | { status: "approved"; by: "admin"; decidedBy: string | null }
  | { status: "approved"; by: typeof POLICY_APPROVER; requester: { personId: string; name: string } };

/**
 * Files a request. The caller's insert adds whatever its scope forces (the
 * employee's own team_members row); once the row lands, its approval is opened
 * or recorded as decided, and leave born approved is announced.
 */
export async function createLeave(input: {
  leave: NewLeave;
  arrival: LeaveArrival;
  insert: (row: NewLeaveRow) => WriteAnswer<{ id: string }>;
  /** people.id of whoever files it, so the inbox leaves them out. */
  actorPersonId: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { leave, arrival } = input;
  const { data: inserted, error } = await input.insert({
    team_member_id: leave.teamMemberId,
    leave_type: leave.leaveType,
    status: arrival.status,
    approved_at: arrival.status === "approved" ? new Date().toISOString() : null,
    start_date: leave.startDate,
    end_date: leave.endDate,
    is_half_day: leave.isHalfDay,
    days: leave.days,
    reason: leave.reason,
  });
  if (error) return { ok: false, error: error.message };
  const id = inserted?.id;
  if (!id) return { ok: false, error: "Could not save the request." };

  const span = { requestId: id, teamMemberId: leave.teamMemberId, leaveType: leave.leaveType, startDate: leave.startDate, endDate: leave.endDate };
  if (arrival.status === "requested") {
    await openLeaveApproval({ ...span, requesterPersonId: arrival.requester.personId, requesterName: arrival.requester.name, approver: arrival.approver });
  } else if (arrival.by === "admin") {
    // The admin asked and answered at once, so they are both.
    await recordLeaveBornApproved({ ...span, requestedBy: arrival.decidedBy, decidedBy: arrival.decidedBy, by: "admin" });
  } else {
    await recordLeaveBornApproved({
      ...span,
      requestedBy: arrival.requester.personId,
      decidedBy: null,
      by: POLICY_APPROVER,
      label: leaveApprovalLabel({ ...span, requesterName: arrival.requester.name }),
    });
  }
  await announceLeaveCreated(arrival.status, { id, ...leaveFacts(leave) }, input.actorPersonId);
  return { ok: true, id };
}

function leaveFacts(leave: NewLeave): Omit<DecidedLeave, "id"> {
  return { teamMemberId: leave.teamMemberId, startDate: leave.startDate, endDate: leave.endDate, leaveType: leave.leaveType };
}
