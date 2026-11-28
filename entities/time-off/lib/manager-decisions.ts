// An Edge8 manager deciding a report's leave from the team Inbox's Decisions (S.5, TH.11). Until
// this existed the approver resolver could name an Edge8 manager and email them
// "awaiting approval in the admin", while the manager had nowhere to decide.
//
// Two independent checks before any write, as the portal's client manager has:
// the resolver must name THIS person as an Edge8 approver for the request's
// member, and the request must still be pending. Who decided is recorded on the
// request's approval (S.5 contract); the leave row keeps only when.
import { companyOs } from "@/kernel/data/supabase";
import type { Result } from "@/kernel/data/result";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { leadsTheOrg, resolveLeaveApprover } from "./approver";
import { LEAVE_ROW_COLUMNS, leaveRowFrom, timeOffWriter, transitionLeave } from "./leave-transition";
import { nextLeaveStatus, type LeaveStatus } from "./transitions";

const REFUSED = "You cannot decide this request.";

export async function decideLeaveAsManager(actor: TeamActor, id: string, decision: "approved" | "rejected"): Promise<Result> {
  const { data: row, error: readErr } = await companyOs
    .from("time_off")
    .select(LEAVE_ROW_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!row) return { ok: false, error: REFUSED };

  // Nobody decides their own leave, except whoever leads the organisation: with
  // no manager above them there is nobody else to ask. Anyone else deciding
  // their own request is refused whatever the resolver says.
  if (row.team_member_id === actor.teamMemberId) {
    if (!(await leadsTheOrg(actor.teamMemberId))) return { ok: false, error: REFUSED };
  } else {
    // A resolver that cannot answer refuses: this is the permission check, and
    // guessing here is how a manager came to decide a client's leave (S.19.5).
    const approver = await resolveLeaveApprover(row.team_member_id).catch((err) => {
      console.error("[time-off/manager-decisions] approver", err instanceof Error ? err.message : err);
      return undefined;
    });
    if (approver === undefined) return { ok: false, error: "Could not check who decides this request. Try again." };
    if (!approver || approver.kind !== "edge8" || approver.personId !== actor.personId) return { ok: false, error: REFUSED };
  }

  // The rules, the guarded write, the approval and the fact are one step
  // (A.30); a request decided in between matches nothing and records nothing.
  return transitionLeave({
    row: leaveRowFrom(id, row),
    decision,
    actor: "manager",
    write: timeOffWriter(id),
    decidedBy: actor.personId,
  });
}

/**
 * An admin deciding any request, as the admin time-off board does
 * (decideTimeOff), for a caller who is not in a browser: the Edge8 connector's
 * held leave decision (OC.2), run by its routine as the admin who asked. The
 * same rules: the request must be able to move, and nobody decides their own
 * leave unless they lead the organisation. The caller has checked
 * time-off.manage; the routine checks it again when it runs.
 */
export async function decideLeaveAsAdmin(actor: TeamActor, id: string, decision: "approved" | "rejected"): Promise<Result> {
  const { data: row, error } = await companyOs.from("time_off").select(LEAVE_ROW_COLUMNS).eq("id", id).maybeSingle();
  if (error || !row) return { ok: false, error: error?.message ?? "Request not found." };
  const allowed = nextLeaveStatus(row.status as LeaveStatus, decision, "admin");
  if (allowed.outcome === "refuse") return { ok: false, error: allowed.error };
  if (allowed.outcome === "noop") return { ok: true };
  if (actor.teamMemberId === row.team_member_id && !(await leadsTheOrg(actor.teamMemberId))) return { ok: false, error: "Somebody else decides your leave." };
  return transitionLeave({ row: leaveRowFrom(id, row), decision, actor: "admin", write: timeOffWriter(id), decidedBy: actor.personId });
}
