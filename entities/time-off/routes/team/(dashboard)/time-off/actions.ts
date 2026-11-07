"use server";

import { revalidatePath } from "next/cache";
import { saigonToday } from "@/kernel/config/dates";
import { findOverlappingTimeOff, overlapMessage } from "@/entities/time-off/lib/overlap";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import {
  teamInsertOwn,
  teamRead,
  getOwnApprovalPolicy,
} from "@/entities/team";
import { resolveLeaveApprover, clientWatcherEmails, createLeave, LEAVE_ROW_COLUMNS, leaveRowFrom, timeOffWriter, transitionLeave } from "@/entities/time-off";
import {
  LEAVE_TYPES,
  LEAVE_TYPE_LABEL,
  countWorkingDays,
  formatDays,
  listHolidayDates,
  type LeaveType,
} from "@/entities/time-off";
import { formatDate } from "@/kernel/ui/format";
import { notifyOps } from "@/kernel/messaging/lark";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { escapeHtml } from "@/kernel/config/html";
import type { Result } from "@/kernel/data/result";

// Own-service time-off actions for /team. Deliberately NOT a reuse of the
// admin actions in entities/time-off/routes/admin/(dashboard)/operations/time-off/requests/actions.ts
// — those are safe only under requireAdmin(); reused as-is here they would let
// any signed-in employee file or cancel leave for anyone (IDOR). Every write
// below goes through requireTeamMember() plus the scoped helpers in
// entities/team/lib/data.ts, which force or verify actor.teamMemberId server-side.

type SubmitResult = { ok: true; autoApproved: boolean } | { ok: false; error: string };

const LEAVE_TYPE_SET = new Set<string>(LEAVE_TYPES);

function refresh() {
  revalidatePath("/team/time-off");
}

// Minimal HTML-escape for free-text interpolated into an email body. `reason`
// is employee-authored and lands in their manager's inbox, so it must not be
// able to inject markup.
export async function requestOwnTimeOff(input: {
  leaveType: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  reason: string;
}): Promise<SubmitResult> {
  await requirePermission("time-off.mine");
  const actor = await requireTeamMember();

  if (!LEAVE_TYPE_SET.has(input.leaveType)) return { ok: false, error: "Pick a leave type." };
  if (!input.startDate || !input.endDate) return { ok: false, error: "Pick start and end dates." };
  if (input.endDate < input.startDate)
    return { ok: false, error: "End date cannot be before the start date." };
  if (input.isHalfDay && input.startDate !== input.endDate)
    return { ok: false, error: "A half day must be a single date." };

  // Approval mode follows the actor's leave policy (Edge8 Core Team
  // auto-approves; On Target stays manual). Resolved server-side — the client
  // never gets to pick its own approval path. Auto-approved rows are stamped
  // approved_at and get a decided approval that names nobody and says "policy"
  // (A.30) — the admin board renders that combination as "auto".
  const clash = await findOverlappingTimeOff(actor.teamMemberId, input.startDate, input.endDate);
  if (!clash.ok) return { ok: false, error: clash.error };
  if (clash.overlap) return { ok: false, error: overlapMessage(clash.overlap) };

  const policy = await getOwnApprovalPolicy(actor);
  // Leave whose dates have already passed is a record, not a request: nobody
  // can approve or refuse days that were taken. It is confirmed on entry
  // (C.24, product call), stamped like a policy auto-approval — a policy
  // approval naming nobody — so the board shows it as "auto" rather than as a
  // person's decision.
  const alreadyTaken = input.endDate < saigonToday();
  const autoApprove = policy.autoApprove || alreadyTaken;

  // The day count is settled here, before the insert, and stored on the row.
  // It used to be computed only for the notification text, leaving `days` null
  // and every later read recomputing it — so a holiday added to the calendar
  // afterwards would silently restate leave somebody had already taken. What
  // the employee was shown when they submitted is what the row keeps (T.1).
  const holidays = await listHolidayDates(input.startDate, input.endDate);
  const days = countWorkingDays(input.startDate, input.endDate, input.isHalfDay, holidays);

  // A request that waits on a person opens an approval naming them, so it is
  // on their "waiting on me" list (S.5). Resolved once, here, and reused below
  // for the email, so the list and the email always name the same approver.
  // A resolver that cannot answer leaves it waiting on the admins, who may
  // decide any request, and says so in the log.
  const approver = autoApprove ? null : await resolveLeaveApprover(actor.teamMemberId).catch((err) => {
    console.error("[time-off] approver unresolved; the request waits on the admins", err instanceof Error ? err.message : err);
    return null;
  });

  // One step with its approval and its fact (A.30). A policy auto-approval is
  // an approval: no decide button will ever run for this row, so if the fact
  // is not stated here it is never stated at all, and coaching's subscriber
  // leaves a booked 1-1 sitting inside the holiday (S.2). teamInsertOwn forces
  // team_member_id = actor.teamMemberId, so there is nothing to spoof.
  const requester = { personId: actor.personId, name: actor.name };
  const created = await createLeave({
    leave: {
      teamMemberId: actor.teamMemberId,
      leaveType: input.leaveType,
      startDate: input.startDate,
      endDate: input.endDate,
      isHalfDay: input.isHalfDay,
      days,
      reason: input.reason.trim() || null,
    },
    arrival: autoApprove ? { status: "approved", by: "policy", requester } : { status: "requested", requester, approver },
    insert: async (row) => {
      // teamInsertOwn answers its error as a sentence; the step reads PostgREST's shape.
      const { data, error } = await teamInsertOwn(actor, "time_off", { ...row, leave_type: row.leave_type as LeaveType });
      return { data, error: error ? { message: error } : null };
    },
    actorPersonId: actor.personId,
  });
  if (!created.ok) return { ok: false, error: created.error };

  // Best-effort notifications: never let a Lark/email failure block or fail
  // the request the employee just successfully submitted.
  const leaveLabel = LEAVE_TYPE_LABEL[input.leaveType as LeaveType];
  const dateRange =
    input.startDate === input.endDate
      ? formatDate(input.startDate)
      : `${formatDate(input.startDate)} → ${formatDate(input.endDate)}`;

  notifyOps(
    autoApprove
      ? `Time off auto-approved: ${actor.name} — ${leaveLabel}, ${dateRange} (${formatDays(days)}).`
      : `Time off requested: ${actor.name} — ${leaveLabel}, ${dateRange} (${formatDays(days)}). Needs approval.`,
    { category: "people_ops" },
  ).catch(() => {});

  // The approver is the client manager on this person's placement when there
  // is one, else their Edge8 manager (lib/time-off/approver.ts). The client's
  // portal admins are copied for visibility only — and their copy carries NO
  // reason: the plan's privacy line is that the free-text reason reaches the
  // one person deciding, nobody else.
  const reason = input.reason.trim();
  const subject = autoApprove
    ? `Time off: ${actor.name} — ${dateRange}`
    : `Time off request from ${actor.name}`;
  const body = (opts: { withReason: boolean; where: string; link: string }) =>
    autoApprove
      ? `
        <p>${escapeHtml(actor.name)} booked ${leaveLabel.toLowerCase()} leave: ${dateRange} (${formatDays(days)}).</p>
        ${opts.withReason && reason ? `<p>Reason: ${escapeHtml(reason)}</p>` : ""}
        <p>Approved automatically under the ${escapeHtml(policy.policyName ?? "company")} policy — no action needed.</p>
      `
      : `
        <p>${escapeHtml(actor.name)} requested ${leaveLabel.toLowerCase()} leave: ${dateRange} (${formatDays(days)}).</p>
        ${opts.withReason && reason ? `<p>Reason: ${escapeHtml(reason)}</p>` : ""}
        <p>${opts.where}</p>
        ${opts.link}
      `;

  (autoApprove ? resolveLeaveApprover(actor.teamMemberId) : Promise.resolve(approver))
    .then(async (approver) => {
      if (!approver) return;
      const isClient = approver.kind === "client";
      const portalLink = `<p><a href="${await getSiteOrigin()}/portal/time-off">Open Time Off</a></p>`;
      await sendTransactionalEmail({
        to: approver.email,
        subject,
        html: body({
          withReason: true,
          where: isClient
            ? "It is waiting for your decision in the Edge8 client portal, under Time Off."
            : "It is waiting for your decision in the Edge8 team hub, under Approvals.",
          link: isClient ? portalLink : "",
        }),
      });

      const watchers = await clientWatcherEmails(approver);
      if (watchers.length === 0) return;
      await sendTransactionalEmail({
        to: watchers,
        subject,
        html: body({
          withReason: false,
          where: `${escapeHtml(approver.displayName)} has been asked to approve it. This copy is for visibility.`,
          link: portalLink,
        }),
      });
    })
    .catch(() => {});

  refresh();
  return { ok: true, autoApproved: autoApprove };
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
