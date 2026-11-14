// Server-only. One person's own leave request, from whichever surface asks:
// the Time Off page's request sheet and the Team Portal connector (MCP).
// Moved here from the page's server action so both run the same checks, the
// same approval routing and the same notices; each caller has already guarded
// itself and resolved the actor, and hands in the approval policy it read.
import { saigonToday } from "@/kernel/config/dates";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { formatDate } from "@/kernel/ui/format";
import { notifyOps } from "@/kernel/messaging/lark";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { escapeHtml } from "@/kernel/config/html";
import { findOverlappingTimeOff, overlapMessage } from "./overlap";
import { fileOwnLeave } from "./leave-filing";
import { resolveLeaveApprover, clientWatcherEmails } from "./approver";
import { createLeave } from "./leave-transition";
import { LEAVE_TYPES, LEAVE_TYPE_LABEL, countWorkingDays, formatDays, type LeaveType } from "./leave";
import { listHolidayDates } from "./holidays";

export type OwnLeaveInput = {
  leaveType: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  reason: string;
};

export type OwnLeaveResult = { ok: true; autoApproved: boolean; days: number } | { ok: false; error: string };

const LEAVE_TYPE_SET = new Set<string>(LEAVE_TYPES);

/**
 * Files the actor's own leave request: validates it, refuses an overlap,
 * counts the working days, auto-approves under the actor's policy (or for days
 * already past), opens the approval and sends the notices. The row is always
 * the actor's own (fileOwnLeave).
 */
export async function requestOwnLeave(
  actor: TeamActor,
  input: OwnLeaveInput,
  policy: { policyName: string | null; autoApprove: boolean },
): Promise<OwnLeaveResult> {

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
  // leaves a booked 1-1 sitting inside the holiday (S.2). fileOwnLeave forces
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
    // fileOwnLeave answers in PostgREST's shape, which the step reads.
    insert: (row) => fileOwnLeave(actor, { ...row, leave_type: row.leave_type as LeaveType } as Parameters<typeof fileOwnLeave>[1]),
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

  return { ok: true, autoApproved: autoApprove, days };
}
