// Client-visible time-off for assigned staff. A dedicated, reviewed helper —
// same reasoning as entities/portal/lib/team.ts: the scope is two-step (assignments ->
// derived team_member ids) and the column list is hard-restricted well below
// what admin/time-off.ts exposes internally.
//
// PRIVACY HARD LINE (docs/plans/2026-07-11-client-portal-design.md): a client
// sees person, leave type, dates, half-day flag, and status ("who is out
// when"), and NOTHING else. `reason` and `manager_note` are free text that can
// hold medical/personal detail and must never be selected here, even to
// discard client-side — don't add them to the select list. Pending
// (`requested`) rows show as "pending" with no other detail, so the select
// list is identical regardless of status.
//
// Relaxed per Dave, 2026-08-26: the admin History table's directory columns
// (approver, team, location, leave policy, work schedule, balances) are now
// client-visible for a client's OWN assigned staff — see
// getAssignedLeaveDirectory below. The reason/manager_note line above is
// unchanged and stays absolute.

import { selectTeamDirectory } from "@/entities/org";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { selectStaffAssignments } from "@/entities/contacts";
import type { PortalActor } from "@/kernel/identity/portal-auth";
import { getAssignedTeamMemberIds, STAFF_NAME_COLUMNS, staffName } from "@/entities/portal/lib/team";
import {
  getBalanceReviews,
  getMemberLeave,
  hoursToDays,
  leaveWarnings,
  recordBalanceReview,
  leaveRowFrom,
  LEAVE_ROW_COLUMNS,
  nextLeaveStatus,
  resolveLeaveApprover,
  timeOffWriter,
  transitionLeave,
  selectTimeOff,
  teamMemberIdsManagedBy,
  updateTimeOff,
  type BalanceReview,
  type LeavePolicySummary,
  type LeaveStatus,
  type LeaveWarning,
  type MemberLeave,
} from "@/entities/time-off";
import { byFirstName, NAME_ONLY_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

export type PortalTimeOffEntry = {
  id: string;
  teamMemberId: string;
  name: string;
  leaveType: string;
  status: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
};

type Row = {
  id: string;
  team_member_id: string;
  leave_type: string;
  status: string;
  start_date: string;
  end_date: string;
  is_half_day: boolean;
};

type NameRow = NamedPerson & { id: string };

// No date window: clients can page the calendar back through history and
// forward through booked leave (per Dave, 2026-08-18 — planning visibility
// beats a narrow horizon; volume is small). The privacy line is the restricted
// column list above, not the date range.
const VISIBLE_STATUSES = ["requested", "approved", "taken"] as const;

export async function getAssignedTimeOff(actor: PortalActor): Promise<PortalTimeOffEntry[]> {
  const memberIds = await getAssignedTeamMemberIds(actor);
  if (memberIds.length === 0) return [];

  const { data, error: timeOffError } = await selectTimeOff("id, team_member_id, leave_type, status, start_date, end_date, is_half_day")
    .in("team_member_id", memberIds)
    .in("status", VISIBLE_STATUSES)
    .order("start_date", { ascending: true });
  if (timeOffError) console.error("[portal] time_off read failed:", timeOffError.message);

  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return [];

  // Directory-safe name lookup only — no other team_directory columns.
  // A failed read raises: every member would otherwise read "Team member" (S.19.7).
  const directoryRows = mustRows(await selectTeamDirectory(`id, ${STAFF_NAME_COLUMNS}`).in("id", memberIds), "[portal] team_directory names");
  const nameById = new Map((directoryRows as NameRow[]).map((r) => [r.id, staffName(r)]));

  return rows.map((r) => ({
    id: r.id,
    teamMemberId: r.team_member_id,
    name: nameById.get(r.team_member_id) ?? staffName({}),
    leaveType: r.leave_type,
    status: r.status,
    startDate: r.start_date,
    endDate: r.end_date,
    isHalfDay: r.is_half_day,
  }));
}

// ---------------------------------------------------------------------------
// Leave directory (per Dave, 2026-08-26): the same per-person table the admin
// History page shows, scoped to the client's assigned staff. Column list is
// still explicit — team_directory carries more than this (emails, employment
// fields) and no /portal code may select it wholesale.
// ---------------------------------------------------------------------------

export type PortalLeaveDirectoryRow = {
  id: string;
  name: string;
  // The client-side approver named on the placement, or null. Never the Edge8
  // manager chain — internal reporting lines don't belong in a client portal
  // (2026-08-26: the person was absent from that client's records).
  approverName: string | null;
  team: string | null;
  location: string | null;
  leavePolicy: string | null;
  workSchedule: string | null;
  status: string | null;
  // The whole calculation for the per-person shelf: dates, opening figures and
  // the ledger. Balances only; no reasons or notes ride on it.
  leave: MemberLeave | null;
  // The latest sign-off (stale once the balance changed) and what to check.
  review: BalanceReview | null;
  warnings: LeaveWarning[];
  // True when the signed-in person is this member's client manager.
  canConfirm: boolean;
  // Computed from the member's policy rules when the policy has them (plan:
  // private-docs/workflows/private/e8/pto-policies-plan.html); null otherwise.
  computed: {
    accruedDays: number;
    openingDays: number;
    accruedPolicyYearDays: number;
    usedAllTimeDays: number;
    usedPolicyYearDays: number;
    policyYearStart: string | null;
    remainingDays: number;
    pendingDays: number;
  } | null;
  policyId: string | null;
};

type LeaveDirectoryRow = NamedPerson & {
  id: string;
  team: string | null;
  location: string | null;
  leave_policy: string | null;
  work_schedule: string | null;
  status: string | null;
};

export async function getAssignedLeaveDirectory(actor: PortalActor): Promise<PortalLeaveDirectoryRow[]> {
  const memberIds = await getAssignedTeamMemberIds(actor);
  if (memberIds.length === 0) return [];

  // Sorted by first name below: full_name is legal order, so ordering on it
  // filed some people by family name and others by given name (S.16.20).
  // A failed read raises rather than showing the client an empty directory.
  const data = mustRows(await selectTeamDirectory(`id, ${STAFF_NAME_COLUMNS}, team, location, leave_policy, work_schedule, status`)
    .in("id", memberIds), "[portal] leave directory");

  // Client-side approver per member: the client_manager named on this client's
  // own active placement (oldest wins, same tie-break as resolveLeaveApprover).
  // Members without one get null; the page renders "Edge8" so the client still
  // sees the leave is handled, without naming internal staff. A manager with no
  // name, or whose read failed, is "Client manager", never email/Edge8 (S.16.26).
  const { data: assignmentRows, error: assignmentRowsError } = await selectStaffAssignments("team_member_id, client_manager_person_id, created_at")
    .in("team_member_id", memberIds)
    .in("company_id", actor.companyScope)
    .eq("status", "active")
    .not("client_manager_person_id", "is", null)
    .order("created_at", { ascending: true });
  if (assignmentRowsError) console.error("[portal] staff_assignments read failed:", assignmentRowsError.message);
  const approverPersonByMember = new Map<string, string>();
  for (const a of (assignmentRows ?? []) as { team_member_id: string; client_manager_person_id: string }[]) {
    if (!approverPersonByMember.has(a.team_member_id))
      approverPersonByMember.set(a.team_member_id, a.client_manager_person_id);
  }

  const approverIds = [...new Set(approverPersonByMember.values())];
  const approverNameById = new Map<string, string>();
  if (approverIds.length > 0) {
    const { data: peopleRows, error: peopleRowsError } = await companyOs
      .from("people")
      .select(`id, ${NAME_ONLY_COLUMNS}`)
      .in("id", approverIds);
    if (peopleRowsError) console.error("[portal] people read failed:", peopleRowsError.message);
    for (const p of (peopleRows ?? []) as ({ id: string } & NamedPerson)[]) approverNameById.set(p.id, personName({ ...p, email: null }, "Client manager"));
  }

  const [leaveById, managedIds] = await Promise.all([
    getMemberLeave(memberIds),
    teamMemberIdsManagedBy(actor.personId, actor.companyScope),
  ]);
  const reviews = await getBalanceReviews(leaveById);
  const managed = new Set(managedIds);

  return ((data ?? []) as LeaveDirectoryRow[]).map((r) => {
    const leave = leaveById.get(r.id) ?? null;
    const b = leave?.balance ?? null;
    const hpd = leave?.policy?.accrual.hoursPerDay ?? 8;
    return {
      id: r.id,
      name: staffName(r),
      approverName: approverPersonByMember.has(r.id) ? approverNameById.get(approverPersonByMember.get(r.id)!) ?? "Client manager" : null,
      team: r.team,
      location: r.location,
      leavePolicy: leave?.policy?.name ?? r.leave_policy,
      workSchedule: r.work_schedule,
      status: r.status,
      leave,
      review: reviews.get(r.id) ?? null,
      warnings: leave ? leaveWarnings(leave, reviews.get(r.id) ?? null) : [],
      canConfirm: managed.has(r.id),
      computed: b
        ? {
            accruedDays: hoursToDays(b.accruedHours + b.anchorHours + b.adjustedHours, hpd),
            openingDays: hoursToDays(b.openingHours, hpd),
            accruedPolicyYearDays: hoursToDays(b.accruedPolicyYearHours, hpd),
            usedAllTimeDays: hoursToDays(b.usedAllTimeHours, hpd),
            usedPolicyYearDays: hoursToDays(b.usedPolicyYearHours, hpd),
            policyYearStart: b.policyYearStart,
            remainingDays: hoursToDays(b.remainingHours, hpd),
            pendingDays: hoursToDays(b.pendingHours, hpd),
          }
        : null,
      policyId: leave?.policy?.id ?? null,
    };
  }).sort((a, b) => byFirstName(a.name, b.name));
}

// A client manager confirms one member's balance as it stands now. Only the
// client manager named on that member's active placement may, never an admin
// viewing the portal through Assume, and the balance is recomputed here rather
// than taken from the browser.
export async function confirmAssignedBalance(
  actor: PortalActor,
  teamMemberId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (actor.impersonation) return { ok: false, error: "Sign in as the client manager to confirm a balance." };
  const managed = await teamMemberIdsManagedBy(actor.personId, actor.companyScope);
  if (!managed.includes(teamMemberId)) {
    return { ok: false, error: "Only this person's client manager can confirm their balance." };
  }
  const leave = (await getMemberLeave([teamMemberId])).get(teamMemberId);
  if (!leave) return { ok: false, error: "Not found." };
  return recordBalanceReview(leave, actor.email, {
    source: "portal",
    person_id: actor.personId,
    company_scope: actor.companyScope,
  });
}

// The distinct leave policies the client's assigned staff are on, so the
// portal can show each policy once, as the same card the employee sees. The
// card shows the rules and the text only; no member's balance rides on it.
export async function getAssignedLeavePolicies(actor: PortalActor): Promise<LeavePolicySummary[]> {
  const memberIds = await getAssignedTeamMemberIds(actor);
  if (memberIds.length === 0) return [];
  const leaveById = await getMemberLeave(memberIds);
  const seen = new Map<string, LeavePolicySummary>();
  for (const l of leaveById.values()) {
    if (l.policy && !seen.has(l.policy.id)) seen.set(l.policy.id, l.policy);
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Client-side approval (docs/plans/2026-08-12-client-manager-time-off-approval.md)
//
// The one exception to the read-only, reason-free rules above, and it is
// narrow: a person named as client manager on an active placement sees the
// pending requests of THOSE people only, with the reason, because they are the
// one deciding. Scope is derived server-side from the placement rows
// (teamMemberIdsManagedBy), never from the portal role and never from client
// input. A client admin with no placements naming them gets an empty queue and
// no reasons, same as before.
// ---------------------------------------------------------------------------

export type PortalDecisionRequest = {
  id: string;
  name: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  reason: string | null;
  requestedAt: string | null;
};

type DecisionRow = Row & { reason: string | null; created_at: string | null };

// Does this person approve anyone's leave? Drives whether the section renders
// at all, so an approver with an empty queue still sees "Nothing waiting on
// you" instead of the section vanishing after their last decision.
export async function isClientLeaveApprover(actor: PortalActor): Promise<boolean> {
  const ids = await teamMemberIdsManagedBy(actor.personId, actor.companyScope);
  return ids.length > 0;
}

export async function getLeaveDecisionQueue(actor: PortalActor): Promise<PortalDecisionRequest[]> {
  const managedIds = await teamMemberIdsManagedBy(actor.personId, actor.companyScope);
  if (managedIds.length === 0) return [];

  const { data, error: timeOffError2 } = await selectTimeOff("id, team_member_id, leave_type, status, start_date, end_date, is_half_day, reason, created_at")
    .in("team_member_id", managedIds)
    .eq("status", "requested")
    .order("start_date", { ascending: true });
  if (timeOffError2) console.error("[portal] time_off read failed:", timeOffError2.message);
  const rows = (data ?? []) as unknown as DecisionRow[];
  if (rows.length === 0) return [];

  // A failed read raises: the queue the client acts on would name nobody.
  const directoryRows = mustRows(await selectTeamDirectory(`id, ${STAFF_NAME_COLUMNS}`).in("id", managedIds), "[portal] team_directory names");
  const nameById = new Map((directoryRows as NameRow[]).map((r) => [r.id, staffName(r)]));

  return rows.map((r) => ({
    id: r.id,
    name: nameById.get(r.team_member_id) ?? staffName({}),
    leaveType: r.leave_type,
    startDate: r.start_date,
    endDate: r.end_date,
    isHalfDay: r.is_half_day,
    reason: r.reason,
    requestedAt: r.created_at,
  }));
}

export type DecisionResult = { ok: true } | { ok: false; error: string };

// Records a client manager's decision. Two independent checks before any
// write: the request must belong to someone this actor manages, and it must
// still be pending. Who decided is recorded on the request's approval with the
// client manager's person (S.5 contract): a client manager is not an Edge8
// employee, and the admin board names them as a client for that reason.
export async function decideAssignedTimeOff(
  actor: PortalActor,
  id: string,
  decision: "approved" | "rejected",
): Promise<DecisionResult> {
  if (!id) return { ok: false, error: "Missing request." };

  const managedIds = await teamMemberIdsManagedBy(actor.personId, actor.companyScope);
  if (managedIds.length === 0) return { ok: false, error: "You cannot decide this request." };

  // The span travels with the row because an approval here is the same fact the
  // admin screen states, and it is announced on the bus the same way (S.2). A
  // failed read says so rather than reading as a request that is not there.
  const { data: target, error: rowError } = await selectTimeOff(`id, ${LEAVE_ROW_COLUMNS}`).eq("id", id).maybeSingle();
  if (rowError) {
    console.error("[portal] time_off read failed:", rowError.message);
    return { ok: false, error: "Could not load the request. Try again." };
  }
  const found = (target as unknown as { status: string; team_member_id: string; start_date: string; end_date: string; leave_type: string } | null) ?? null;
  if (!found || !managedIds.includes(found.team_member_id))
    return { ok: false, error: "You cannot decide this request." };
  // A decision already made is refused as such before the approver is asked
  // for, as the admin screen does, so the client manager reads why.
  const allowed = nextLeaveStatus(found.status as LeaveStatus, decision, "client-manager");
  if (allowed.outcome === "refuse") return { ok: false, error: allowed.error };
  if (allowed.outcome === "noop") return { ok: true };

  // Belt and braces: the approver resolver must independently name this actor
  // for this member. Scope and approver are two different questions and both
  // have to say yes.
  const approver = await resolveLeaveApprover(found.team_member_id).catch((e) => (console.error("[portal] leave approver", e), null)); // a failed read refuses (S.19.5)
  if (!approver || approver.kind !== "client" || approver.personId !== actor.personId)
    return { ok: false, error: "You cannot decide this request." };

  // The client manager's decision is the same step the admin's is (A.30): the
  // narrower portal rule, a write guarded on the status just read, the approval
  // and the fact on the bus, so this surface cannot record a decision only its
  // own screens hear about.
  return transitionLeave({
    row: leaveRowFrom(id, found),
    decision,
    actor: "client-manager",
    write: timeOffWriter(id),
    decidedBy: actor.personId,
  });
}
