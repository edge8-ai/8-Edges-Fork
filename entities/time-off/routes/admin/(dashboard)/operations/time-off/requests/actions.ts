"use server";

import { revalidatePath } from "next/cache";
import { findOverlappingTimeOff, overlapMessage } from "@/entities/time-off/lib/overlap";
import { companyOs } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { LEAVE_TYPES, countWorkingDays, listHolidayDates, type LeaveType } from "@/entities/time-off";
import { createLeave, insertTimeOff, LEAVE_ROW_COLUMNS, leadsTheOrg, leaveRowFrom, timeOffWriter, transitionLeave } from "@/entities/time-off";
import { personIdForEmail } from "@/kernel/identity/person-by-email";
import { mustRows } from "@/kernel/data/read";
import { nextLeaveStatus, type LeaveStatus } from "@/entities/time-off";
import type { Result } from "@/kernel/data/result";

const LEAVE_TYPE_SET = new Set<string>(LEAVE_TYPES);

function refresh() {
  revalidatePath("/admin/operations/time-off/requests");
}

// Who the acting admin is: their person (the decider an approval records) and,
// when they are also a team member, that row (what the self-decision check
// compares with the request's member). Admins are not guaranteed to be team
// members, so teamMemberId may be null. A failed read raises rather than
// answering null: null here switches the self-decision check off, so a database
// error would otherwise let an admin decide their own leave (S.19.4).
type ActingAdmin = { personId: string | null; teamMemberId: string | null };
async function actingAdmin(email: string): Promise<ActingAdmin> {
  const personId = await personIdForEmail(email);
  if (!personId) return { personId: null, teamMemberId: null };
  const [tm] = mustRows(
    await companyOs.from("team_members").select("id").eq("person_id", personId).limit(1),
    "[operations/time-off] acting team member",
  );
  return { personId, teamMemberId: tm?.id ?? null };
}

const WHO_FAILED = "Could not check who you are, so nothing was changed. Try again.";
const acting = (email: string): Promise<ActingAdmin | null> =>
  actingAdmin(email).catch((err) => {
    console.error("[operations/time-off] acting admin", err instanceof Error ? err.message : err);
    return null;
  });

export async function createTimeOff(input: {
  teamMemberId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  reason: string;
}): Promise<Result> {
  const { user: admin } = await requirePermission("time-off.manage");

  if (!input.teamMemberId) return { ok: false, error: "Pick a team member." };
  if (!LEAVE_TYPE_SET.has(input.leaveType)) return { ok: false, error: "Pick a leave type." };
  if (!input.startDate || !input.endDate) return { ok: false, error: "Pick start and end dates." };
  if (input.endDate < input.startDate)
    return { ok: false, error: "End date cannot be before the start date." };
  if (input.isHalfDay && input.startDate !== input.endDate)
    return { ok: false, error: "A half day must be a single date." };

  // An admin logging leave IS the approval — inserting as "requested" only made
  // the same admin approve their own entry a click later. Stamp the decision.
  const clash = await findOverlappingTimeOff(input.teamMemberId, input.startDate, input.endDate);
  if (!clash.ok) return { ok: false, error: clash.error };
  if (clash.overlap) return { ok: false, error: overlapMessage(clash.overlap) };

  const me = await acting(admin.email);
  if (!me) return { ok: false, error: WHO_FAILED };
  // Logging leave here approves it, so logging your own is deciding your own:
  // only whoever leads the organisation may. Anyone else requests it on /team.
  if (me.teamMemberId && me.teamMemberId === input.teamMemberId && !(await leadsTheOrg(me.teamMemberId)))
    return { ok: false, error: "Request your own leave from the team hub; somebody else decides it." };
  // Settle and store the day count here, as the employee's own path does, so
  // the row carries what it was approved for rather than leaving every later
  // read to recompute it against a calendar that may have changed (T.1).
  const holidays = await listHolidayDates(input.startDate, input.endDate);
  // Logging leave approves it, so this is one step with its approval and its
  // fact (A.30): the admin who logged it is its decider, and coaching hears the
  // days are now a fact about the calendar, after the insert and never before.
  const created = await createLeave({
    leave: {
      teamMemberId: input.teamMemberId,
      leaveType: input.leaveType as LeaveType,
      startDate: input.startDate,
      endDate: input.endDate,
      isHalfDay: input.isHalfDay,
      days: countWorkingDays(input.startDate, input.endDate, input.isHalfDay, holidays),
      reason: input.reason.trim() || null,
    },
    arrival: { status: "approved", by: "admin", decidedBy: me.personId },
    insert: (row) => insertTimeOff({ ...row, leave_type: row.leave_type as LeaveType }).select("id").maybeSingle(),
    actorPersonId: me.personId,
  });
  if (!created.ok) return created;

  refresh();
  return { ok: true };
}

export async function decideTimeOff(
  id: string,
  decision: "approved" | "rejected",
): Promise<Result> {
  const { user: admin } = await requirePermission("time-off.manage");

  // The span comes back with the status because an approval is announced on the
  // bus, and the fact is the days — a subscriber reading them back out of
  // time_off would be reaching into this entity's table for something this
  // entity already had in hand (S.2).
  const { data: row, error: rErr } = await companyOs
    .from("time_off")
    .select(LEAVE_ROW_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (rErr || !row) return { ok: false, error: rErr?.message ?? "Request not found." };

  // Refused before asking who the admin is, so a request that cannot move says
  // so even when that lookup fails.
  const allowed = nextLeaveStatus(row.status as LeaveStatus, decision, "admin");
  if (allowed.outcome === "refuse") return { ok: false, error: allowed.error };
  if (allowed.outcome === "noop") return { ok: true };

  const me = await acting(admin.email);
  if (!me) return { ok: false, error: WHO_FAILED };
  // An admin deciding their own leave is refused, unless they lead the
  // organisation: that one person has nobody above them to ask.
  if (me.teamMemberId && me.teamMemberId === row.team_member_id && !(await leadsTheOrg(me.teamMemberId)))
    return { ok: false, error: "Somebody else decides your leave." };
  // One step (A.30): a write guarded on the status just read, so a request
  // cancelled or decided in between matches nothing and records no second
  // decision (S.19.10); then the approval, and the fact — leave.approved, or
  // leave.withdrawn when this denies leave already approved.
  const moved = await transitionLeave({
    row: leaveRowFrom(id, row),
    decision,
    actor: "admin",
    write: timeOffWriter(id),
    decidedBy: me.personId,
  });
  if (!moved.ok) return moved;

  refresh();
  return { ok: true };
}

export async function cancelTimeOff(id: string): Promise<Result> {
  const { user: admin } = await requirePermission("time-off.manage");

  // The span comes back with the status because cancelling approved leave
  // withdraws it, and that fact names the days (A.30).
  const { data: row, error: rErr } = await companyOs
    .from("time_off")
    .select(LEAVE_ROW_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (rErr || !row) return { ok: false, error: rErr?.message ?? "Request not found." };

  // Who cancelled is recorded on the approval; a failed lookup names nobody
  // rather than refusing a cancellation the admin may make either way.
  const me = await acting(admin.email);
  const moved = await transitionLeave({
    row: leaveRowFrom(id, row),
    decision: "cancelled",
    actor: "admin",
    write: timeOffWriter(id),
    decidedBy: me?.personId ?? null,
  });
  if (!moved.ok) return moved;

  refresh();
  return { ok: true };
}
