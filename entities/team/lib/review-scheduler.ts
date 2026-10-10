import { mustRows } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import {
  openReviewCycle,
  reviewMomentsInWindow,
  reviewSurveySlug,
  reviewLinkPath,
  REVIEW_TYPE_LABEL,
  type ScheduledMoment,
  type RaterKind,
  type ReviewType,
} from "@/entities/team/lib/reviews";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

// The performance-review scheduler (docs/plans/2026-08-12-performance-reviews.md,
// PR 3). Two jobs, run daily by /api/cron/performance-reviews:
//   1. Open cycles whose moment date has just arrived (probation start+6w,
//      mid-year anchor+5m, renewal anchor+11m), emailing both parties.
//   2. Chase open cycles weekly until each side submits.
// Both are stateless: opening is idempotent on the deterministic cycle label,
// reminders fire on a day-count cadence (no "last nudged" column to maintain).

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? "";
// How late a moment can be and still auto-open. Covers a missed cron run or a
// contract date filled in a few days late, without retro-opening old moments.
const OPEN_GRACE_DAYS = 21;
// Members who count for scheduling. pre_start has not begun; terminated/alumni
// have left.
const SCHEDULED_STATUSES = ["active", "on_leave", "notice"];
// Weekly reminder cadence and the point we stop nagging.
const REMINDER_EVERY_DAYS = 7;
const REMINDER_MAX_DAYS = 42;

type NameEmail = NamedPerson;
function selfEmailHtml(typeName: string, link: string): string {
  return (
    `<p>It is time for your ${typeName.toLowerCase()}.</p>` +
    `<p>Please complete your self-assessment. Your manager sees it only after they finish their own review.</p>` +
    `<p><a href="${link}">Start your self-assessment</a></p>` +
    `<p>You can also find it under Reviews in the team portal.</p>`
  );
}
function managerEmailHtml(typeName: string, subjectName: string, link: string): string {
  return (
    `<p>A ${typeName.toLowerCase()} for <strong>${subjectName}</strong> is ready.</p>` +
    `<p>Draft your review, then finalize it. ${subjectName} sees it only once finalized.</p>` +
    `<p><a href="${link}">Start the review</a></p>`
  );
}

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86400000);
}

export type SchedulerResult = {
  date: string;
  opened: { name: string; type: string }[];
  remindersSent: number;
  skippedNoManager: string[];
};

// dryRun previews what would open and how many reminders would fire without
// inserting any row or sending any email — used to sanity-check the daily
// volume before/while the cron is live (exposed via ?dry=1 on the route).
export async function runReviewScheduler(
  todayISO: string,
  opts: { dryRun?: boolean } = {},
): Promise<SchedulerResult> {
  const dryRun = opts.dryRun === true;
  const opened: { name: string; type: string }[] = [];
  const skippedNoManager: string[] = [];

  // ---- 1. open newly-due cycles --------------------------------------------

  // Rule 2 (Y.8): every read below decides who is handled, so a failed read
  // throws and the run records an error, rather than reading as nobody due
  // (or, for the probation check, as nobody already reviewed, which would
  // open a second review for everyone).
  const members = mustRows(
    await companyOs
      .from("team_members")
      .select(`id, manager_id, start_date, contract_start_date, people!person_id(${NAME_COLUMNS})`)
      .in("status", SCHEDULED_STATUSES),
    "[review-scheduler] team_members",
  ) as unknown as Array<{
    id: string;
    manager_id: string | null;
    start_date: string | null;
    contract_start_date: string | null;
    people: NameEmail | NameEmail[] | null;
  }>;

  // Which members already have a probation review (so we never re-open one).
  const probationRows = mustRows(
    await companyOs.from("performance_reviews").select("team_member_id").eq("review_type", "probation"),
    "[review-scheduler] performance_reviews",
  );
  const hasProbation = new Set(probationRows.map((r) => (r as { team_member_id: string }).team_member_id));

  // Resolve manager emails in one batch (forward lookup on the id, never the
  // reverse-embedding PostgREST self-FK).
  const managerIds = [...new Set(members.map((m) => m.manager_id).filter((x): x is string => !!x))];
  const managerById = new Map<string, NameEmail>();
  if (managerIds.length) {
    const data = mustRows(
      await companyOs.from("team_members").select(`id, people!person_id(${NAME_COLUMNS})`).in("id", managerIds),
      "[review-scheduler] team_members (managers)",
    );
    for (const r of data as unknown as Array<{ id: string; people: NameEmail | NameEmail[] | null }>) {
      const p = Array.isArray(r.people) ? r.people[0] ?? null : r.people;
      if (p) managerById.set(r.id, p);
    }
  }

  // A dry run only reports cycles that do not yet exist, which used to mean one
  // existence query per member per moment. The pairs are the same for the whole
  // run, so read them once and match in memory; a real run does not need them
  // (openReviewCycle checks inside its own write path). A failed read leaves the
  // set empty, which reports every moment as "would open" — the same thing the
  // per-moment query did when it errored, and a dry run writes nothing.
  const existingCycleKeys = new Set<string>();
  if (dryRun && members.length > 0) {
    const { data: cycleRows, error: cycleError } = await companyOs
      .from("performance_reviews")
      .select("team_member_id, cycle_label")
      .in(
        "team_member_id",
        members.map((m) => m.id),
      );
    if (cycleError) console.error(`[review-scheduler] dry-run cycle lookup failed: ${cycleError.message}`);
    for (const row of (cycleRows ?? []) as Array<{ team_member_id: string; cycle_label: string | null }>) {
      existingCycleKeys.add(`${row.team_member_id}::${row.cycle_label ?? ""}`);
    }
  }

  for (const m of members) {
    const person = Array.isArray(m.people) ? m.people[0] ?? null : m.people;
    const subjectName = personName(person, "Team member");
    const moments: ScheduledMoment[] = reviewMomentsInWindow({
      startDate: m.start_date ? m.start_date.slice(0, 10) : null,
      contractStartDate: m.contract_start_date ? m.contract_start_date.slice(0, 10) : null,
      hasProbationReview: hasProbation.has(m.id),
      todayISO,
      graceDays: OPEN_GRACE_DAYS,
    });
    if (moments.length === 0) continue;
    if (!m.manager_id) {
      for (const _ of moments) skippedNoManager.push(subjectName);
      continue;
    }

    for (const moment of moments) {
      if (dryRun) {
        // Report only cycles that don't yet exist, matching what a real run
        // would newly open.
        if (!existingCycleKeys.has(`${m.id}::${moment.cycleLabel}`)) {
          opened.push({ name: subjectName, type: moment.type });
        }
        continue;
      }
      const cycle = await openReviewCycle({
        teamMemberId: m.id,
        managerId: m.manager_id,
        reviewType: moment.type,
        cycleLabel: moment.cycleLabel,
      });
      // created 0 means the cycle already existed: skip the emails so a
      // re-run never re-notifies.
      if (cycle.created === 0 || !cycle.selfId || !cycle.managerId) continue;

      const typeName = REVIEW_TYPE_LABEL[moment.type];
      const manager = managerById.get(m.manager_id) ?? null;
      if (person?.email) {
        await sendTransactionalEmail({
          to: [person.email],
          subject: `${typeName}: your self-assessment`,
          html: selfEmailHtml(typeName, `${SITE_ORIGIN}/surveys/perf-review-self?review=${cycle.selfId}`),
          logMeta: { kind: "review_open_self", teamMemberId: m.id, type: moment.type },
        });
      }
      if (manager?.email) {
        const slug = reviewSurveySlug({ rater_kind: "manager", review_type: moment.type });
        await sendTransactionalEmail({
          to: [manager.email],
          subject: `${typeName} to complete: ${subjectName}`,
          html: managerEmailHtml(typeName, subjectName, `${SITE_ORIGIN}/surveys/${slug}?review=${cycle.managerId}`),
          logMeta: { kind: "review_open_manager", teamMemberId: m.id, type: moment.type },
        });
      }
      opened.push({ name: subjectName, type: moment.type });
    }
  }

  // ---- 2. weekly reminders on unfinished cycles ----------------------------

  // Rows still awaiting the rater (open/draft), opened between one week and the
  // nag ceiling ago, on a 7-day multiple. Portal cycles only (imports are
  // finalized). The row's own rater is the recipient.
  const pending = mustRows(
    await companyOs
      .from("performance_reviews")
      .select("id, team_member_id, reviewer_id, review_type, rater_kind, created_at, reviewer_email, access_token")
      .eq("source", "portal")
      .in("status", ["open", "draft"]),
    "[review-scheduler] performance_reviews (pending)",
  ) as unknown as Array<{
    id: string;
    team_member_id: string;
    reviewer_id: string | null;
    review_type: string;
    rater_kind: string;
    created_at: string;
    reviewer_email: string | null;
    access_token: string | null;
  }>;

  // Batch-resolve the recipients (subjects for self rows, reviewers for manager
  // rows) to emails.
  const dueReminders = pending.filter((r) => {
    const age = daysBetween(r.created_at.slice(0, 10), todayISO);
    return age >= REMINDER_EVERY_DAYS && age <= REMINDER_MAX_DAYS && age % REMINDER_EVERY_DAYS === 0;
  });
  const recipientTmIds = [
    ...new Set(
      dueReminders.map((r) => (r.rater_kind === "self" ? r.team_member_id : r.reviewer_id)).filter((x): x is string => !!x),
    ),
  ];
  const emailByTm = new Map<string, NameEmail>();
  if (recipientTmIds.length) {
    const data = mustRows(
      await companyOs.from("team_members").select(`id, people!person_id(${NAME_COLUMNS})`).in("id", recipientTmIds),
      "[review-scheduler] team_members (recipients)",
    );
    for (const r of data as unknown as Array<{ id: string; people: NameEmail | NameEmail[] | null }>) {
      const p = Array.isArray(r.people) ? r.people[0] ?? null : r.people;
      if (p) emailByTm.set(r.id, p);
    }
  }
  // Subject names for the manager-reminder copy.
  const subjectNameByTm = new Map<string, string>();
  const subjectTmIds = [...new Set(dueReminders.map((r) => r.team_member_id))];
  if (subjectTmIds.length) {
    const { data, error: subjectError } = await companyOs
      .from("team_members")
      .select(`id, people!person_id(${NAME_COLUMNS})`)
      .in("id", subjectTmIds);
    if (subjectError) console.error("[review-scheduler] team_members", subjectError);
    for (const r of (data ?? []) as Array<{ id: string; people: NameEmail | NameEmail[] | null }>) {
      const p = Array.isArray(r.people) ? r.people[0] ?? null : r.people;
      subjectNameByTm.set(r.id, personName(p, "your report"));
    }
  }

  let remindersSent = 0;
  for (const r of dueReminders) {
    // External reviewers are reached at the email on the row; everyone else
    // through their team_members record.
    let recipientEmail: string | null = null;
    if (r.rater_kind === "external") {
      recipientEmail = r.reviewer_email;
    } else {
      const recipientTm = r.rater_kind === "self" ? r.team_member_id : r.reviewer_id;
      if (!recipientTm) continue;
      recipientEmail = emailByTm.get(recipientTm)?.email ?? null;
    }
    if (!recipientEmail) continue;
    const typeName = REVIEW_TYPE_LABEL[r.review_type as keyof typeof REVIEW_TYPE_LABEL] ?? "Performance review";
    if (dryRun) {
      remindersSent += 1;
      continue;
    }
    const link = `${SITE_ORIGIN}${reviewLinkPath({ id: r.id, rater_kind: r.rater_kind as RaterKind, review_type: r.review_type as ReviewType, access_token: r.access_token })}`;
    const html =
      r.rater_kind === "self"
        ? `<p>A quick reminder: your ${typeName.toLowerCase()} self-assessment is still open.</p>` +
          `<p><a href="${link}">Complete it now</a></p>`
        : `<p>A quick reminder: the ${typeName.toLowerCase()} for <strong>${subjectNameByTm.get(r.team_member_id) ?? "your report"}</strong> is still open.</p>` +
          `<p><a href="${link}">Complete it now</a></p>`;
    const ok = await sendTransactionalEmail({
      to: [recipientEmail],
      subject: `Reminder: ${typeName} still open`,
      html,
      logMeta: { kind: "review_reminder", reviewId: r.id, rater: r.rater_kind },
    });
    if (ok) remindersSent += 1;
  }

  return { date: todayISO, opened, remindersSent, skippedNoManager };
}
