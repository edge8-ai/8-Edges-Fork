"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { teamRead, getOwnApprovalPolicy } from "@/entities/team";
import { LEAVE_ROW_COLUMNS, leaveRowFrom, requestOwnLeave, timeOffWriter, transitionLeave, type OwnLeaveInput } from "@/entities/time-off";
import type { Result } from "@/kernel/data/result";

// Own-service time-off actions for /team. Deliberately NOT a reuse of the
// admin actions in entities/time-off/routes/admin/(dashboard)/operations/time-off/requests/actions.ts
// — those are safe only under requireAdmin(); reused as-is here they would let
// any signed-in employee file or cancel leave for anyone (IDOR). Every write
// below goes through requireTeamMember() plus the scoped helpers in
// entities/team/lib/data.ts, which force or verify actor.teamMemberId server-side.

type SubmitResult = { ok: true; autoApproved: boolean } | { ok: false; error: string };

function refresh() {
  revalidatePath("/team/time-off");
}

export async function requestOwnTimeOff(input: OwnLeaveInput): Promise<SubmitResult> {
  await requirePermission("time-off.mine");
  const actor = await requireTeamMember();
  // Approval mode follows the actor's leave policy, resolved server-side: the
  // client never picks its own approval path. The request itself is
  // time-off's (lib/own-leave-request.ts), shared with the Team Portal connector.
  const result = await requestOwnLeave(actor, input, await getOwnApprovalPolicy(actor));
  if (!result.ok) return result;
  refresh();
  return { ok: true, autoApproved: result.autoApproved };
}

export async function cancelOwnTimeOff(id: string): Promise<Result> {
  await requirePermission("time-off.mine");
  const actor = await requireTeamMember();
  if (!id) return { ok: false, error: "Missing request." };

  // Deliberately stricter than the actor's general read scope: a manager's
  // scope includes their reports (so they can see and later approve/reject
  // those requests), but this is the employee's OWN cancel button, so it must
  // check literal self-ownership, not "self or report".
  const { data: row, error: rowError } = await teamRead(actor, "time_off", LEAVE_ROW_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  // A failed read says so, rather than reading as a request that is not there.
  if (rowError) {
    console.error("[time-off] time_off", rowError);
    return { ok: false, error: "Could not load the request. Try again." };
  }
  const r = row as { status: string; team_member_id: string; start_date: string; end_date: string; leave_type: string } | null;
  if (!r || r.team_member_id !== actor.teamMemberId) return { ok: false, error: "Request not found." };

  // One step (A.30). The write goes through time-off's own writer rather than
  // teamUpdateInScope, because it must be guarded on the status just read — a
  // manager deciding the request in between wins, rather than being
  // overwritten by a cancel that read "requested" — and the team layer's
  // update cannot say that. It stays filtered to the actor's own row, so the
  // self-ownership checked above is also enforced by the query that writes.
  // Cancelling approved leave withdraws it, and says so.
  const moved = await transitionLeave({
    row: leaveRowFrom(id, r),
    decision: "cancelled",
    actor: "employee",
    write: timeOffWriter(id, { teamMemberId: actor.teamMemberId }),
    decidedBy: actor.personId,
  });
  if (!moved.ok) return moved;

  refresh();
  return { ok: true };
}
