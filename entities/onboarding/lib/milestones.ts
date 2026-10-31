// The six onboarding-cycle milestones, lifted out of ./cycle so that file is the
// daily driver (load the rows, resolve the context, walk the list, advance the
// stage) and this one is the rules for each moment. The order below is the
// order the cron has always run. Every once-only milestone (Day 8, Day 45,
// Day 60, Day 180) claims its stamp in the database before it acts, because the
// row a run reads can be stale: Day 8 repeated for five mornings in Sep 2026,
// and Day 60 promoted one hire twice on 24 and 25 Sep (Y.4, Y.35).
//
// Nothing here imports ./cycle at runtime. What a milestone needs from the
// database (`patchJourney`, the stamp claim and release, `recruiterEmailFor`) arrives on
// the context instead, so the dependency runs one way and the milestones can be
// tested with plain stubs.

import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { recordAudit } from "@/kernel/audit/audit";
import { addDays } from "@/kernel/config/dates";
import { emailsWhoMayOpen } from "@/kernel/identity/may-open";
import { updateTeamMembers } from "@/kernel/identity/writes";
import type { Contact, CycleRow, CycleRunSummary } from "./cycle";
import type { JourneyColumn, JourneyStamp } from "./journey-claim";
import { DAY8_SURVEY_SLUG, TALENT_DIRECTOR_EMAIL } from "./cycle-constants";

// Everything one milestone needs about the row it is looking at, resolved once
// per row by the driver below.
export type MilestoneCtx = {
  todayISO: string;
  // Day number on the cycle clock (start_date is Day 1).
  d: number;
  start: string;
  // When probation ends: the stored date, else start + 59 days.
  probEnd: string;
  manager: Contact | undefined;
  // The member in the third person (to managers) and as addressed (to them).
  name: string;
  greeting: string | null;
  origin: string;
  boardLink: string;
  // Someone already confirmed full time (promoted before this feature, or by
  // an admin directly) rides the board to Day 180 but must never re-enter the
  // review/decision flow.
  alreadyFullTime: boolean;
  // Mutated in place; the driver returns it.
  summary: CycleRunSummary;
  // The journey writes and the recruiter lookup, injected by the driver.
  patchJourney: (id: string, patch: Record<string, unknown>) => Promise<{ ok: true } | { ok: false; error: string }>;
  // Takes a once-only stamp in the database; true only for the one caller that
  // found it (and every `unlessSet` column) still empty.
  claimJourneyStamp: (id: string, column: JourneyStamp, unlessSet?: JourneyColumn[]) => Promise<boolean>;
  // Gives a claimed stamp back after a failed send; raises if it cannot.
  releaseJourneyStamp: (id: string, column: JourneyStamp) => Promise<void>;
  recruiterEmailFor: (personId: string | null) => Promise<string | null>;
};

// The Resend idempotency key of a once-only milestone email (Y.64): one per
// milestone and journey, so the mailer's retry of a lost reply replays the
// first send instead of making a second. Resend forgets a key after 24 hours,
// which is why a Day 45 re-armed by an extension, weeks later, sends again.
function milestoneEmailKey(milestone: "day8" | "day45" | "day60" | "day180", journeyId: string): string {
  return `onboarding/${milestone}/${journeyId}`;
}

// A milestone returns true when it has closed the journey out and the driver
// should stop working this row (only Day 180 ever does).
export type Milestone = (row: CycleRow, ctx: MilestoneCtx) => Promise<boolean>;

// Every reminder below points its manager at a page, and a link goes only to
// someone who may open that page (AC.15, ADR 0013). The shared talent inbox is
// a mailbox, not a person: it keeps its copy, as it always has. A manager who
// may not open the page is left off, and a reminder addressed to the manager
// alone is not sent. Asked before a stamp is claimed, so a reminder that did
// not go is not marked as sent.
async function managerWhoMayOpen(manager: Contact | undefined, href: string): Promise<string[]> {
  return manager?.email ? emailsWhoMayOpen([manager.email], [href]) : [];
}

// 1) Plan-link nag: the 7 days before Day 1, daily, deliberately
//    stateless — it repeats until the plan link is added.
export async function planNagMilestone(row: CycleRow, ctx: MilestoneCtx): Promise<boolean> {
  const { d, start, name, manager, boardLink, summary } = ctx;
  if (d >= -6 && d <= 0 && !row.plan_url && !row.plan_path && manager?.email) {
    const managers = await managerWhoMayOpen(manager, boardLink);
    const ok = await sendTransactionalEmail({
      to: [...managers, TALENT_DIRECTOR_EMAIL],
      subject: `Onboarding plan needed before Day 1: ${name}`,
      html:
        `<p><strong>${name}</strong> starts on <strong>${start}</strong> (${1 - d} day${1 - d === 1 ? "" : "s"} away) and their onboarding plan link is not added yet.</p>` +
        `<p>Every new hire needs their plan in place one week before Day 1. This reminder repeats daily until the link is added.</p>` +
        `<p><a href="${boardLink}">Add it on your Onboarding board</a></p>`,
      logMeta: { source: "onboarding-cycle", kind: "plan_nag" },
    });
    if (ok) summary.planNags += 1;
  }
  return false;
}

// 2) Day 8 feedback survey to the new hire. Only worth sending while the
//    first weeks are fresh: past day 30 (journeys backfilled long after
//    start) stamp it as handled instead of sending a "one week in" email
//    to someone two months in.
//
//    The stamp is claimed in the database before the email goes, not written
//    after it: the row this run read may be stale, and from 19 to 23 Sep 2026
//    it was, so the survey went out every morning. The claim only succeeds
//    while the stamp is empty and no answer is linked, so a second run, a
//    manual run, or someone who answered from a shared link gets nothing. A
//    refused or failed send hands the stamp back for tomorrow's run.
export async function day8SurveyMilestone(row: CycleRow, ctx: MilestoneCtx): Promise<boolean> {
  const { d, greeting, origin, summary } = ctx;
  if (row.day8_survey_sent_at) return false;
  if (d > 30 || (d >= 8 && row.day8_response_id)) {
    await ctx.claimJourneyStamp(row.id, "day8_survey_sent_at");
    return false;
  }
  if (d < 8 || !row.member.email) return false;
  if (!(await ctx.claimJourneyStamp(row.id, "day8_survey_sent_at", ["day8_response_id"]))) return false;

  // Rendered once, before the send: a retry under the key must carry the same
  // bytes, or Resend answers 409 instead of replaying the first send.
  const message = {
    to: row.member.email,
    subject: "One week in — 3 quick questions",
    html:
      `<p>Hi ${greeting ?? "there"},</p>` +
      `<p>You are one week into Edge8. Three quick questions (about a minute) so we can fix anything that is not working:</p>` +
      `<p><a href="${origin}/surveys/${DAY8_SURVEY_SLUG}">Answer the Day 8 survey</a></p>` +
      `<p>Your manager and the talent team read every response.</p>`,
    logMeta: { source: "onboarding-cycle", kind: "day8_survey" },
    idempotencyKey: milestoneEmailKey("day8", row.id),
  };
  let ok: boolean;
  try {
    ok = await sendTransactionalEmail(message);
  } catch (sendError) {
    await ctx.releaseJourneyStamp(row.id, "day8_survey_sent_at");
    throw sendError;
  }
  if (!ok) {
    await ctx.releaseJourneyStamp(row.id, "day8_survey_sent_at");
    return false;
  }
  summary.day8Sent += 1;
  return false;
}

// 3) Probation review to the manager, 15 days before probation ends
//    (Day 45 on the default 60-day window; re-armed by an extension, which
//    clears the stamp in probation-decision.ts). The claim also requires no
//    decision and no promotion on file, so a stale row cannot ask a manager to
//    review someone they have already decided on.
export async function day45ReviewMilestone(row: CycleRow, ctx: MilestoneCtx): Promise<boolean> {
  const { todayISO, probEnd, manager, name, origin, alreadyFullTime, summary } = ctx;
  if (
    todayISO < addDays(probEnd, -15) ||
    row.day45_email_sent_at ||
    row.decision ||
    row.day60_promoted_at ||
    alreadyFullTime ||
    !manager?.email
  ) {
    return false;
  }
  const decisionPath = `/team/probation/${row.team_member_id}`;
  const [reviewer] = await managerWhoMayOpen(manager, decisionPath);
  if (!reviewer) return false;
  if (!(await ctx.claimJourneyStamp(row.id, "day45_email_sent_at", ["decision", "day60_promoted_at"]))) return false;

  const message = {
    to: reviewer,
    subject: `Probation review due: ${name}`,
    html:
      `<p><strong>${name}</strong>${row.member.positionTitle ? ` (${row.member.positionTitle})` : ""} finishes probation on <strong>${probEnd}</strong>.</p>` +
      `<p>Record your decision — offer full time, extend probation 30 days, or terminate.</p>` +
      `<p><a href="${origin}/team/probation/${row.team_member_id}">Record the decision</a></p>`,
    logMeta: { source: "onboarding-cycle", kind: "day45_review" },
    idempotencyKey: milestoneEmailKey("day45", row.id),
  };
  let ok: boolean;
  try {
    ok = await sendTransactionalEmail(message);
  } catch (sendError) {
    await ctx.releaseJourneyStamp(row.id, "day45_email_sent_at");
    throw sendError;
  }
  if (!ok) {
    await ctx.releaseJourneyStamp(row.id, "day45_email_sent_at");
    return false;
  }
  summary.reviewsSent += 1;
  return false;
}

// 4) Decision overdue: 5 days before probation ends with no decision on
//    file — daily, stateless, CC the talent director. Nothing promotes
//    automatically until a human decides.
export async function decisionReminderMilestone(row: CycleRow, ctx: MilestoneCtx): Promise<boolean> {
  const { todayISO, probEnd, manager, name, origin, alreadyFullTime, summary } = ctx;
  if (
    todayISO >= addDays(probEnd, -5) &&
    !row.decision &&
    !row.day60_promoted_at &&
    !alreadyFullTime &&
    manager?.email
  ) {
    const managers = await managerWhoMayOpen(manager, `/team/probation/${row.team_member_id}`);
    const ok = await sendTransactionalEmail({
      to: [...managers, TALENT_DIRECTOR_EMAIL],
      subject: `Probation decision overdue: ${name}`,
      html:
        `<p><strong>${name}</strong>'s probation ends on <strong>${probEnd}</strong> and no decision is recorded.</p>` +
        `<p>Nothing happens automatically until you decide. This reminder repeats daily.</p>` +
        `<p><a href="${origin}/team/probation/${row.team_member_id}">Record the decision</a></p>`,
      logMeta: { source: "onboarding-cycle", kind: "decision_reminder" },
    });
    if (ok) summary.decisionReminders += 1;
  }
  return false;
}

// 5) Day 60 promotion: probation over + manager passed them -> full time,
//    congratulations to the hire, CC manager + recruiter. Someone already
//    full time just gets the marker stamped quietly — no writes, no email.
//
//    The stamp is claimed before the promotion, not written after it. On 25 Sep
//    2026 the run read a cached row from before the previous day's promotion,
//    still on probation and unpromoted, and promoted and congratulated the hire
//    a second time. A failed promotion write hands the stamp back and raises,
//    so the driver counts it and tomorrow retries. A failed email does not:
//    the promotion is the milestone, and releasing would promote them again.
export async function day60PromotionMilestone(row: CycleRow, ctx: MilestoneCtx): Promise<boolean> {
  const { todayISO, probEnd, manager, greeting, alreadyFullTime, summary } = ctx;
  if (row.day60_promoted_at) return false;
  if (alreadyFullTime) {
    await ctx.claimJourneyStamp(row.id, "day60_promoted_at");
    return false;
  }
  if (todayISO < probEnd || row.decision !== "offer_full_time") return false;
  if (!(await ctx.claimJourneyStamp(row.id, "day60_promoted_at"))) return false;

  const statusPatch = row.member.status === "pre_start" ? { status: "active" } : {};
  const { error } = await updateTeamMembers({ employment_stage: "full_time", ...statusPatch })
    .eq("id", row.team_member_id);
  if (error) {
    await ctx.releaseJourneyStamp(row.id, "day60_promoted_at");
    throw new Error(`[onboarding-cycle] promotion failed: ${error.message}`);
  }
  await recordAudit({
    table: "team_members",
    recordId: row.team_member_id,
    operation: "update",
    actor: "onboarding-cycle",
    context: { action: "day60_promotion", probation_end: probEnd },
  });
  summary.promoted += 1;
  if (row.member.email) {
    const recruiter = await ctx.recruiterEmailFor(row.member.personId);
    const cc = [...new Set([manager?.email, recruiter ?? TALENT_DIRECTOR_EMAIL].filter(
      (e): e is string => Boolean(e),
    ))];
    const message = {
      to: [row.member.email, ...cc],
      subject: `Congratulations${greeting ? ` ${greeting}` : ""} — you're a full-time Edge8 team member!`,
      html:
        `<p>Hi ${greeting ?? "there"},</p>` +
        `<p><strong>Congratulations!</strong> You passed probation and as of today you are a full-time member of the Edge8 team.</p>` +
        `<p>Thank you for everything you have put in over your first 60 days — we are glad you are here.</p>` +
        `<p>— The Edge8 team</p>`,
      logMeta: { source: "onboarding-cycle", kind: "day60_congrats" },
      idempotencyKey: milestoneEmailKey("day60", row.id),
    };
    await sendTransactionalEmail(message);
  }
  return false;
}

// 6) Day 180: prompt the Talent Director for the stay interview, close the
//    journey. The stamp is claimed before the email, like every once-only
//    milestone; closing the journey is written after it went.
export async function day180StayMilestone(row: CycleRow, ctx: MilestoneCtx): Promise<boolean> {
  const { d, start, name, summary } = ctx;
  if (d < 180 || row.day180_email_sent_at) return false;
  if (!(await ctx.claimJourneyStamp(row.id, "day180_email_sent_at"))) return false;

  const message = {
    to: TALENT_DIRECTOR_EMAIL,
    subject: `180-day stay interview: ${name}`,
    html:
      `<p><strong>${name}</strong>${row.member.positionTitle ? ` (${row.member.positionTitle})` : ""} hits 180 days on <strong>${addDays(start, 179)}</strong>.</p>` +
      `<p>Time for their stay interview: what keeps them here, what would make them leave, what should change.</p>`,
    logMeta: { source: "onboarding-cycle", kind: "day180_stay" },
    idempotencyKey: milestoneEmailKey("day180", row.id),
  };
  let ok: boolean;
  try {
    ok = await sendTransactionalEmail(message);
  } catch (sendError) {
    await ctx.releaseJourneyStamp(row.id, "day180_email_sent_at");
    throw sendError;
  }
  if (!ok) {
    await ctx.releaseJourneyStamp(row.id, "day180_email_sent_at");
    return false;
  }
  summary.day180Sent += 1;
  // The email went; a journey left open would only be closed again tomorrow,
  // and its stamp stops a second email. The cycle's catch counts the row.
  const closed = await ctx.patchJourney(row.id, { completed_at: new Date().toISOString(), stage: "complete" });
  if (!closed.ok) throw new Error(`Day 180 sent, but the journey was not closed: ${closed.error}`);
  return true; // journey closed; nothing further to do for this row
}

// The milestones in the order the cron has always run them. Order matters: the
// idempotency stamps each one writes are read by the ones after it (a Day 60
// promotion stamped here is what stops the Day 45 nag next run).
export const MILESTONES: Milestone[] = [
  planNagMilestone,
  day8SurveyMilestone,
  day45ReviewMilestone,
  decisionReminderMilestone,
  day60PromotionMilestone,
  day180StayMilestone,
];
