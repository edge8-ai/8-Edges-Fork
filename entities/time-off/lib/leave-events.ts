// Time off's side of the bus (S.2, docs/adr/0003).
//
// Two leave moves matter outside this entity. An approval is the moment a
// person's days stop being a request and become a fact about the calendar:
// coaching subscribes, because a 1-1 already booked inside the span should not
// sit there waiting to be missed, and the inbox tells the requester. Withdrawn
// leave takes that back (A.30): the inbox tells the requester again, so the
// approval is not the last thing they read.
//
// Both are published only by leave-transition.ts, the one step every surface
// takes to move a request, so no surface can write a status and skip its fact.
//
// Time off publishes and does not care who listens. That is the whole reason
// this is an event and not a call: time-off `requires` nothing — it is the
// bottom of the graph — so it may not import coaching, and a deployment that
// installs leave without coaching is a normal deployment, not a broken one.
import { publish } from "@/kernel/events";
import {
  leaveApprovedFact,
  leaveBornAs,
  leaveWithdrawnFact,
  type DecidedLeave,
  type LeaveStatus,
  type LeaveTransition,
} from "./transitions";

/**
 * Announce an approval, if that is what the decision was.
 *
 * Called AFTER the write lands, never before: the bus awaits its handlers, so
 * a subscriber that acted on a row the database then refused would have moved
 * somebody's 1-1 for a holiday that never got approved.
 *
 * Returns nothing and throws nothing a caller has to handle — a handler failure
 * is the bus's business to log and audit, and an optional entity must not be
 * able to fail the approve button.
 */
export async function announceLeaveApproved(next: LeaveTransition, row: DecidedLeave, actorPersonId: string | null = null): Promise<void> {
  const fact = leaveApprovedFact(next, row);
  if (!fact) return;
  // Who caused the approval, so the inbox leaves them out (S.19.9). Stated only
  // when known, so a caller that cannot say publishes the fact as before.
  await publish("leave.approved", actorPersonId ? { ...fact, actorPersonId } : fact);
}

/**
 * Announce a row that was born in its final status, for the two paths that
 * never decide anything: the admin logging leave for somebody (inserted
 * approved) and the employee whose policy auto-approves or whose dates have
 * already passed (inserted approved).
 *
 * Same contract as above — called AFTER the insert lands, silent when the
 * status is anything but approved — and deliberately the same door, so "was
 * this an approval" stays one reading in transitions.ts rather than a
 * `status === "approved"` repeated at every insert.
 */
export async function announceLeaveCreated(status: LeaveStatus, row: DecidedLeave, actorPersonId: string | null = null): Promise<void> {
  await announceLeaveApproved(leaveBornAs(status), row, actorPersonId);
}

/**
 * Announce withdrawn leave, if that is what the move did: approved leave that
 * became cancelled or rejected (A.30). Same contract as the approval above —
 * after the write lands, silent for any other move, nothing for a caller to
 * handle.
 */
export async function announceLeaveWithdrawn(
  from: LeaveStatus,
  next: LeaveTransition,
  row: DecidedLeave,
  actorPersonId: string | null = null,
): Promise<void> {
  const fact = leaveWithdrawnFact(from, next, row);
  if (!fact) return;
  await publish("leave.withdrawn", actorPersonId ? { ...fact, actorPersonId } : fact);
}
