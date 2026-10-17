// Which statuses a leave request may move to, and who may move it.
//
// Four surfaces decide leave — the admin screen, the employee's own page, the
// client portal and, since S.5, an Edge8 manager's approvals page — and until
// A.7 each of the first three hard-coded its own guard. They did not
// agree: an admin may deny leave that is already approved, a client manager may
// not, and nothing anywhere said that was intended. The surface difference is
// stated here now, as a row in one table, rather than implied by three guards
// in three files that nobody reads together.
//
// Pure on purpose. These rules were previously reachable only through a full
// server action with live auth, so no test touched them; the way
// balance.test.ts table-tests computeLeaveBalance is the way this is tested.
//
// What does NOT live here is authorization. The team and admin action files
// deliberately do not share code, for the IDOR reasons stated in them: "self"
// and "self or report" are different scopes and the check belongs beside the
// query that enforces it. This module answers "may this status become that
// one", never "is this caller allowed to ask".
//
// Type-only import: the module stays pure, and `leaveApprovedFact` below shapes
// the event without knowing that a bus exists.
import type { EventPayload } from "@/kernel/events";

export type LeaveStatus = "requested" | "approved" | "rejected" | "cancelled" | "taken";
export type LeaveDecision = "approved" | "rejected" | "cancelled";

/**
 * Who is asking. Not a permission — the caller has already proved it is this
 * actor — but the surface whose rules apply.
 *
 *  - `admin`          an Edge8 admin on /admin/operations/time-off.
 *  - `employee`       the person whose leave it is, on /team/time-off.
 *  - `client-manager` a client's manager in the portal, deciding leave for the
 *    staff assigned to them.
 *  - `manager`        an Edge8 manager on /team/approvals, deciding leave for
 *    the reports the approver resolver names them for (S.5).
 */
export type LeaveActor = "admin" | "employee" | "client-manager" | "manager";

/**
 * What the caller should do:
 *
 *  - `apply`  write this status.
 *  - `noop`   the request is already there; return ok without writing. Cancel
 *             is idempotent on both self-serve surfaces, and always was.
 *  - `refuse` return this sentence as the action's error.
 */
export type LeaveTransition =
  | { outcome: "apply"; status: LeaveStatus }
  | { outcome: "noop" }
  | { outcome: "refuse"; error: string };

const apply = (status: LeaveStatus): LeaveTransition => ({ outcome: "apply", status });
const refuse = (error: string): LeaveTransition => ({ outcome: "refuse", error });

export function nextLeaveStatus(
  current: LeaveStatus,
  decision: LeaveDecision,
  actor: LeaveActor,
): LeaveTransition {
  if (decision === "cancelled") return cancel(current, actor);

  if (actor === "employee") {
    // An employee withdraws their own request; they never decide one. No
    // surface offers this today, and the rule is written down so none can
    // acquire it by accident.
    return refuse("You cannot decide your own leave.");
  }

  // An Edge8 manager decides by the same narrower rule as a client manager: a
  // request while it is pending, never a decision already made (S.5).
  if (actor === "client-manager" || actor === "manager") {
    // Strictly narrower than admin, and deliberately so: a client manager
    // decides a request while it is still pending and never revisits a
    // decision an Edge8 admin has made. Before A.7 this was a lone
    // `status !== "requested"` in entities/portal/lib/time-off.ts with nothing
    // saying whether the difference was a rule or an oversight.
    return current === "requested" ? apply(decision) : refuse("This request has already been decided.");
  }

  if (decision === "approved") {
    return current === "requested" ? apply("approved") : refuse("Only pending requests can be approved.");
  }
  // The admin override: denying leave that was auto-approved by policy, or
  // approved earlier, is the whole reason this differs from approval.
  return current === "requested" || current === "approved"
    ? apply("rejected")
    : refuse("Only pending or approved leave can be denied.");
}

/**
 * The move a row makes by being *created* in a status, rather than by being
 * decided later.
 *
 * Two of the four paths that make leave approved never reach `nextLeaveStatus`
 * at all: an admin logging leave for somebody inserts it approved ("an admin
 * logging leave IS the approval"), and an employee on an auto-approving policy
 * — Edge8 Core Team, which is most internal leave — has their own row inserted
 * approved. There is no later decision for those, so the insert *is* the
 * approval and it has to reach `leaveApprovedFact` through the same door a
 * decision does. Until S.2 was repaired the bus only ever heard about the
 * minority of approvals that went through an approve button, and coaching's
 * subscriber never fired for the rest.
 */
export function leaveBornAs(status: LeaveStatus): LeaveTransition {
  return apply(status);
}

/** The row fields an approval announces. Camel-cased: this is the domain's
 *  vocabulary, not the table's. */
export type DecidedLeave = {
  id: string;
  teamMemberId: string;
  startDate: string;
  endDate: string;
  leaveType: string;
};

/**
 * The fact a decided request states, or null when the decision was not an
 * approval (S.2).
 *
 * It lives beside the table above because the question "was this an approval"
 * is the table's answer, not the caller's: the admin screen, the employee's own
 * page and the client portal each decide leave in their own action, and a
 * second reading of `decision === "approved"` in three places is how the portal
 * would end up announcing a denial it had just recorded as an override.
 *
 * Pure, so it is table-tested with the rest of the transitions and so nothing
 * in this module has to know that a bus exists; entities/time-off/lib/
 * leave-events.ts is what publishes it.
 */
export function leaveApprovedFact(
  next: LeaveTransition,
  row: DecidedLeave,
): EventPayload<"leave.approved"> | null {
  if (next.outcome !== "apply" || next.status !== "approved") return null;
  // A row with no member is nothing a subscriber could act on, and the bus
  // would refuse it anyway — refused here, where the caller is, rather than as
  // a thrown publish inside somebody's approve button.
  if (!row.teamMemberId) return null;
  return {
    requestId: row.id,
    teamMemberId: row.teamMemberId,
    startDate: row.startDate,
    endDate: row.endDate,
    leaveType: row.leaveType,
  };
}

/**
 * The fact a move states when it takes back an approval, or null when it does
 * not (A.30).
 *
 * Withdrawn leave is approved leave that becomes cancelled or rejected: the
 * admin override, or anyone cancelling leave already approved. `leave.approved`
 * was the only leave fact, so the requester's inbox kept saying "approved" for
 * days nobody would take. A request cancelled before anyone decided it was
 * never announced, so its cancellation states nothing either. Pure, beside
 * `leaveApprovedFact`, for the same reason: "did this undo an approval" is the
 * table's answer, not each caller's.
 */
export function leaveWithdrawnFact(
  from: LeaveStatus,
  next: LeaveTransition,
  row: DecidedLeave,
): EventPayload<"leave.withdrawn"> | null {
  if (from !== "approved" || next.outcome !== "apply") return null;
  if (next.status !== "cancelled" && next.status !== "rejected") return null;
  if (!row.teamMemberId) return null;
  return {
    requestId: row.id,
    teamMemberId: row.teamMemberId,
    startDate: row.startDate,
    endDate: row.endDate,
    leaveType: row.leaveType,
    became: next.status,
  };
}

function cancel(current: LeaveStatus, actor: LeaveActor): LeaveTransition {
  if (actor === "client-manager") return refuse("You cannot cancel this request.");
  if (current === "cancelled") return { outcome: "noop" };
  if (current === "taken") return refuse("Taken leave cannot be cancelled.");
  return apply("cancelled");
}
