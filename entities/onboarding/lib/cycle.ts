// Edge8 Onboarding Cycle domain logic (docs/plans/2026-07-22-onboarding-plans-kanban.md).
// One `onboarding_plans` journey per new hire drives the manager kanban at
// /team/onboarding and the daily cron: plan-upload nag (T-7..Day 1) -> Day 8
// feedback survey -> 45-day review -> Day 60 promotion -> Day 180 stay
// interview. Milestone sends are stamped on the journey (idempotent, >= day
// conditions) so a missed cron day self-heals; the plan nag alone is stateless
// and repeats daily by design.
//
// Everything here runs on the service-role client. Callers are the cron route
// (bearer-authed), the survey post-submit processor, and /team reads that have
// already been scoped by lib/team/data.ts.

import { selectSurveyAnswers } from "@/entities/org";
import { mustRows, ReadFailure } from "@/kernel/data/read";
import type { Result } from "@/kernel/data/result";
import { companyOs, supabase } from "@/kernel/data/supabase";
import { selectApplications, selectJobRequisitions } from "@/entities/hiring";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { recordAudit } from "@/kernel/audit/audit";
import { one } from "@/kernel/config/embedded";
import { externalHref } from "@/kernel/ui/url";
import { saigonToday, addDays, diffDays } from "@/kernel/config/dates";
import { updateTeamMembers } from "@/kernel/identity/writes";

export { TALENT_DIRECTOR_EMAIL } from "./cycle-constants";
import { DAY8_SURVEY_SLUG, TALENT_DIRECTOR_EMAIL } from "./cycle-constants";
import { MILESTONES, type MilestoneCtx } from "./milestones";
import { claimJourneyStamp, releaseJourneyStamp } from "./journey-claim";
import { DAY1_CATEGORY, seedPlanTasks } from "./plan-tasks";
import { type GreetedPerson, GREETING_COLUMNS, greetingName, NAME_COLUMNS, personName } from "@/kernel/config/people-name";

// Kanban columns, in order. `complete` renders inside the Day 180 column.
export const CYCLE_STAGES = [
  { key: "preboarding", label: "Preboarding" },
  { key: "day_1", label: "Day 1 · Orientation" },
  { key: "day_8", label: "Day 8 · Feedback" },
  { key: "day_45", label: "45 Day Review" },
  { key: "day_60", label: "60 Day Decision" },
  { key: "day_180", label: "180 Day Stay Interview" },
] as const;
export type CycleStage = (typeof CYCLE_STAGES)[number]["key"] | "complete";

const STAGE_ORDER: Record<CycleStage, number> = {
  preboarding: 0,
  day_1: 1,
  day_8: 2,
  day_45: 3,
  day_60: 4,
  day_180: 5,
  complete: 6,
};

export type CycleDecision = "offer_full_time" | "extend_probation_30" | "terminate";

// Review survey choice label -> decision enum. Labels must match the seeded
// survey field's config.choices exactly.
export const DECISION_BY_CHOICE: Record<string, CycleDecision> = {
  "Offer full time contract": "offer_full_time",
  "Extend probation 30 days": "extend_probation_30",
  "Terminate employee": "terminate",
};

// The three Day 1 orientation activities, seeded as onboarding_tasks.
const DAY1_TASKS = [
  "HR Handbook with Mai",
  "Intro to Edge8 with Dave",
  "Team Overview with team manager",
] as const;

// Journeys are only live for people still employed; terminated/alumni journeys
// are skipped, never advanced.
// Exported since S.2: the `candidate.hired` subscriber asks the same "is this
// person on the payroll" question the backfill does, and a second copy of the
// list is how a rehire's alumni row would end up counting on one path and not
// the other.
export const LIVE_STATUSES = ["active", "pre_start", "on_leave", "notice"];

// ---- date helpers (all on YYYY-MM-DD strings, Saigon-date semantics) --------
// Canonical copies live in lib/dates; re-exported because the cron route and
// callers import them from here.
export { saigonToday, addDays, diffDays };

// Day number on the cycle clock: start_date is Day 1; the day before is 0.
export function cycleDay(startDate: string, todayISO: string): number {
  return diffDays(startDate, todayISO) + 1;
}

// ---- journey rows -----------------------------------------------------------

export type PersonEmbed = GreetedPerson & { avatar_url?: string | null };

export type CycleRow = {
  id: string;
  team_member_id: string;
  stage: CycleStage;
  plan_url: string | null;
  plan_path: string | null;
  plan_uploaded_at: string | null;
  day8_survey_sent_at: string | null;
  day8_response_id: string | null;
  day45_email_sent_at: string | null;
  decision: CycleDecision | null;
  decision_at: string | null;
  day60_promoted_at: string | null;
  day180_email_sent_at: string | null;
  completed_at: string | null;
  member: {
    personId: string | null;
    // Shown to managers and on the board, in the third person.
    name: string;
    // How the member's own emails address them ("Hi …"), S.16; null when
    // they have no given name, so each email says its own word.
    greeting: string | null;
    email: string | null;
    avatarUrl: string | null;
    positionTitle: string | null;
    startDate: string | null;
    managerId: string | null;
    status: string | null;
    employmentStage: string | null;
    probationEndsOn: string | null;
    contractStartDate: string | null;
  };
};

// One template literal from end to end: check-table-ownership reads a SELECT
// constant only when it opens and closes with the same quote.
const CYCLE_SELECT =
  `id, team_member_id, stage, plan_url, plan_path, plan_uploaded_at, day8_survey_sent_at, day8_response_id, day45_email_sent_at, decision, decision_at, day60_promoted_at, day180_email_sent_at, completed_at, team_members:team_members!team_member_id(id, person_id, start_date, manager_id, status, employment_stage, probation_ends_on, contract_start_date, people:people!person_id(${GREETING_COLUMNS}, avatar_url), positions:positions!position_id(title))`;

function toCycleRow(raw: Record<string, unknown>): CycleRow {
  const tm = one(raw.team_members as Record<string, unknown> | Record<string, unknown>[] | null);
  const person = one((tm?.people ?? null) as PersonEmbed | PersonEmbed[] | null);
  const pos = one((tm?.positions ?? null) as { title: string | null } | { title: string | null }[] | null);
  return {
    id: raw.id as string,
    team_member_id: raw.team_member_id as string,
    stage: (raw.stage as CycleStage) ?? "preboarding",
    plan_url: (raw.plan_url as string | null) ?? null,
    plan_path: (raw.plan_path as string | null) ?? null,
    plan_uploaded_at: (raw.plan_uploaded_at as string | null) ?? null,
    day8_survey_sent_at: (raw.day8_survey_sent_at as string | null) ?? null,
    day8_response_id: (raw.day8_response_id as string | null) ?? null,
    day45_email_sent_at: (raw.day45_email_sent_at as string | null) ?? null,
    decision: (raw.decision as CycleDecision | null) ?? null,
    decision_at: (raw.decision_at as string | null) ?? null,
    day60_promoted_at: (raw.day60_promoted_at as string | null) ?? null,
    day180_email_sent_at: (raw.day180_email_sent_at as string | null) ?? null,
    completed_at: (raw.completed_at as string | null) ?? null,
    member: {
      personId: ((tm?.person_id as string | null) ?? null),
      name: personName(person, "—"),
      greeting: greetingName(person, null),
      email: person?.email ?? null,
      avatarUrl: person?.avatar_url ?? null,
      positionTitle: pos?.title ?? null,
      startDate: ((tm?.start_date as string | null) ?? null),
      managerId: ((tm?.manager_id as string | null) ?? null),
      status: ((tm?.status as string | null) ?? null),
      employmentStage: ((tm?.employment_stage as string | null) ?? null),
      probationEndsOn: ((tm?.probation_ends_on as string | null) ?? null),
      contractStartDate: ((tm?.contract_start_date as string | null) ?? null),
    },
  };
}

async function loadCycleRows(teamMemberIds?: string[]): Promise<CycleRow[]> {
  let q = companyOs.from("onboarding_plans").select(CYCLE_SELECT);
  if (teamMemberIds) q = q.in("team_member_id", teamMemberIds);
  // Rule 2 (Y.8): this is the cycle's work list and the boards' rows, so a
  // failed read throws rather than reading as nobody in onboarding.
  return (mustRows(await q, "[onboarding-cycle] onboarding_plans") as unknown as Record<string, unknown>[]).map(toCycleRow);
}

// /team board read. teamMemberIds MUST already be the actor's scope (the page
// passes actor.teamMemberScope) — this helper does not widen it.
export async function getCycleRowsFor(teamMemberIds: string[]): Promise<CycleRow[]> {
  if (teamMemberIds.length === 0) return [];
  return loadCycleRows(teamMemberIds);
}

// Admin board read: every journey, company-wide. Callers must be behind
// requireAdmin() — this is deliberately NOT reachable from /team code paths.
export async function getAllCycleRows(): Promise<CycleRow[]> {
  return loadCycleRows();
}

// ---- journey creation / backfill -------------------------------------------

async function seedDay1Tasks(teamMemberId: string, dueDate: string | null): Promise<void> {
  // A failed read must not look like "not seeded yet": it would seed the Day 1
  // checklist a second time.
  const existing = mustRows(
    await companyOs.from("onboarding_tasks").select("id").eq("team_member_id", teamMemberId).eq("category", DAY1_CATEGORY).limit(1),
    "[onboarding-cycle] onboarding_tasks (day 1)",
  );
  if (existing.length > 0) return;
  const { error } = await companyOs.from("onboarding_tasks").insert(
    DAY1_TASKS.map((title, i) => ({
      team_member_id: teamMemberId,
      title,
      description: "1 hour",
      category: DAY1_CATEGORY,
      status: "todo", // onboarding_tasks CHECK: todo|in_progress|done|blocked|skipped
      due_date: dueDate,
      position: i,
    })),
  );
  if (error) console.error("[onboarding-cycle] day1 task seed failed:", error.message);
}

// Create the journey (and Day 1 checklist) for a team member if none exists.
// The stored stage is authoritative for display, so a new journey must seed it
// from the clock immediately — never wait for the next cron pass (the board
// would show everyone in Preboarding until morning; this bit us once).
export async function ensureJourney(teamMemberId: string): Promise<void> {
  const { data: existing, error: journeyExistsError } = await companyOs.from("onboarding_plans").select("id").eq("team_member_id", teamMemberId).maybeSingle();
  if (journeyExistsError) throw new ReadFailure("[onboarding-cycle] onboarding_plans (exists)", journeyExistsError.message);
  if (existing) return;
  const { error } = await companyOs.from("onboarding_plans").insert({ team_member_id: teamMemberId });
  // A concurrent insert loses on the unique(team_member_id) constraint; fine.
  if (error && !error.message.includes("duplicate")) {
    console.error("[onboarding-cycle] journey insert failed:", error.message);
    return;
  }
  const { data: tm, error: tmError } = await companyOs.from("team_members").select("start_date").eq("id", teamMemberId).maybeSingle();
  if (tmError) console.error("[onboarding-cycle] team_members", tmError);
  await seedDay1Tasks(teamMemberId, (tm as { start_date: string | null } | null)?.start_date ?? null);

  const [row] = await loadCycleRows([teamMemberId]);
  if (row) {
    const stage = computeStage(row, saigonToday());
    if (stage !== "complete" && stage !== row.stage) {
      const moved = await patchJourney(row.id, { stage });
      if (!moved.ok) throw new Error(`journey stage for ${teamMemberId} not written: ${moved.error}`);
    }
  }
}

// Every onboarding-stage member gets a journey, and so does ANYONE inside
// their first 180 days regardless of stage (covers hires promoted before this
// feature shipped, and admin-created rows that never passed ensureJourney) —
// the cycle tracks the full first 180 days, not just probation. Contractors
// are excluded: the employee cycle does not apply to them, and imported
// contractor rows carry noisy start_dates (a contractor of a year showed up
// as a Day-7 hire; this bit us once).
export async function backfillJourneys(): Promise<number> {
  const cutoff = addDays(saigonToday(), -179);
  const data = mustRows(
    await companyOs
      .from("team_members")
      .select("id")
      .or(`employment_stage.in.(pre_boarding,probation),start_date.gte.${cutoff}`)
      .neq("employment_type", "contract")
      .in("status", LIVE_STATUSES),
    "[onboarding-cycle] team_members (backfill)",
  );
  const ids = (data as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return 0;
  // A failed read here would make everyone "missing" and open a journey for each.
  const have = mustRows(
    await companyOs.from("onboarding_plans").select("team_member_id").in("team_member_id", ids),
    "[onboarding-cycle] onboarding_plans (backfill)",
  );
  const existing = new Set((have as { team_member_id: string }[]).map((r) => r.team_member_id));
  const missing = ids.filter((id) => !existing.has(id));
  for (const id of missing) await ensureJourney(id);
  return missing.length;
}

// ---- manager / recruiter resolution ----------------------------------------

export type Contact = { name: string; email: string | null };

// Forward lookup by team_members id — never the reverse-resolving PostgREST
// embed on the self-referencing manager_id FK (see lib/admin/probation.ts).
async function resolveMemberContacts(ids: string[]): Promise<Map<string, Contact>> {
  const map = new Map<string, Contact>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data, error: contactsError } = await companyOs.from("team_members").select(`id, people:people!person_id(${NAME_COLUMNS})`).in("id", unique);
  if (contactsError) console.error("[onboarding-cycle] team_members", contactsError);
  for (const r of (data ?? []) as Array<{ id: string; people: PersonEmbed | PersonEmbed[] | null }>) {
    const p = one(r.people);
    if (p) map.set(r.id, { name: personName(p, "—"), email: p.email ?? null });
  }
  return map;
}

// Recruiter to CC on the Day 60 congratulations: latest application -> job
// requisition -> recruiter (a team_members id). Direct hires with no
// application fall back to the talent director.
async function recruiterEmailFor(personId: string | null): Promise<string | null> {
  if (!personId) return null;
  const { data: app, error: appError } = await selectApplications("job_requisition_id")
    .eq("person_id", personId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (appError) console.error("[onboarding-cycle] applications", appError);
  const reqId = (app as { job_requisition_id: string | null } | null)?.job_requisition_id ?? null;
  if (!reqId) return null;
  const { data: req, error: reqError } = await selectJobRequisitions("recruiter_id")
    .eq("id", reqId)
    .maybeSingle();
  if (reqError) console.error("[onboarding-cycle] job_requisitions", reqError);
  const recruiterId = (req as { recruiter_id: string | null } | null)?.recruiter_id ?? null;
  if (!recruiterId) return null;
  const contacts = await resolveMemberContacts([recruiterId]);
  return contacts.get(recruiterId)?.email ?? null;
}

// ---- the daily pass ---------------------------------------------------------

export type CycleRunSummary = {
  date: string;
  journeys: number;
  backfilled: number;
  planNags: number;
  day8Sent: number;
  reviewsSent: number;
  decisionReminders: number;
  promoted: number;
  day180Sent: number;
  // People whose milestones threw this run; the next run retries them.
  failed?: number;
  // The same people by journey id, never by name, for the run record (Y.19).
  failures?: { subject: string; step: string; error: string }[];
};

// One write to a journey; it says whether it landed (Y.69). It used to log and
// return nothing, so every caller read a failed write as done.
export async function patchJourney(id: string, patch: Record<string, unknown>): Promise<Result> {
  const { error } = await companyOs
    .from("onboarding_plans")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[onboarding-cycle] journey update failed:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// The display stage for a journey on a given day. Date-driven, so the board
// self-corrects: columns are states of the clock, not drag targets. The review
// window keys off probation end (probation_ends_on, else Day 60) so a 30-day
// extension moves the Day 45/60 phases with it.
export function computeStage(row: CycleRow, todayISO: string): CycleStage {
  if (row.day180_email_sent_at || row.completed_at) return "complete";
  const start = row.member.startDate;
  if (!start) return "preboarding";
  const d = cycleDay(start, todayISO);
  if (d < 1) return "preboarding";
  if (d >= 180) return "day_180";
  const probEnd = row.member.probationEndsOn ?? addDays(start, 59);
  if (todayISO >= probEnd || row.day60_promoted_at) return "day_60";
  if (todayISO >= addDays(probEnd, -15)) return "day_45";
  if (d >= 8) return "day_8";
  return "day_1";
}

export async function runOnboardingCycle(todayISO: string): Promise<CycleRunSummary> {
  const backfilled = await backfillJourneys();
  const rows = (await loadCycleRows()).filter(
    (r) => r.stage !== "complete" && LIVE_STATUSES.includes(r.member.status ?? ""),
  );
  const managers = await resolveMemberContacts(rows.map((r) => r.member.managerId ?? ""));
  const origin = await getSiteOrigin();

  const summary: CycleRunSummary = {
    date: todayISO,
    journeys: rows.length,
    backfilled,
    planNags: 0,
    day8Sent: 0,
    reviewsSent: 0,
    decisionReminders: 0,
    promoted: 0,
    day180Sent: 0,
  };

  for (const row of rows) {
    const start = row.member.startDate;
    if (!start) continue; // no clock to run without a start date
    const ctx: MilestoneCtx = {
      todayISO,
      d: cycleDay(start, todayISO),
      start,
      probEnd: row.member.probationEndsOn ?? addDays(start, 59),
      manager: row.member.managerId ? managers.get(row.member.managerId) : undefined,
      name: row.member.name,
      greeting: row.member.greeting,
      origin,
      boardLink: `${origin}/team/onboarding`,
      alreadyFullTime: row.member.employmentStage === "full_time",
      summary,
      patchJourney,
      claimJourneyStamp,
      releaseJourneyStamp,
      recruiterEmailFor,
    };

    // One person's failure is one person's failure. An email provider or a
    // lookup throwing for one new starter must not skip everyone after them in
    // the run — the milestones are idempotent, so the next run picks that
    // person up again (onboarding sweep).
    try {
      // Day 1 arriving by the clock starts someone the same way a board move does.
      const started = STAGE_ORDER[computeStage(row, todayISO)] > 0 || STAGE_ORDER[row.stage] > 0;
      if (started && (row.member.status === "pre_start" || row.member.employmentStage === "pre_boarding")) {
        await markStarted(row.team_member_id);
      }

      let closed = false;
      for (const milestone of MILESTONES) {
        if (await milestone(row, ctx)) {
          closed = true;
          break;
        }
      }
      if (closed) continue;

      // Advance the stored stage with the clock — forward only, so a manual move
      // (board drag or drawer select) is never fought backward by the cron.
      const stage = computeStage(row, todayISO);
      if (STAGE_ORDER[stage] > STAGE_ORDER[row.stage]) {
        const moved = await patchJourney(row.id, { stage });
        if (!moved.ok) throw new Error(`stage not written: ${moved.error}`);
      }
    } catch (err) {
      console.error(`[onboarding-cycle] ${row.member.name}: ${err instanceof Error ? err.message : String(err)}`);
      summary.failed = (summary.failed ?? 0) + 1;
      (summary.failures ??= []).push({ subject: `journey ${row.id}`, step: "milestones", error: err instanceof Error ? err.message : String(err) });
    }
  }

  return summary;
}

// ---- survey post-submit processors -----------------------------------------

// Day 8: link the response to the journey so the board can show the score.
// Only links to an EXISTING journey — anyone in the cycle already has one from
// backfill. Creating journeys here put long-tenured staff on the board when
// they merely tested the survey (this bit us once).
export async function recordDay8Response(personId: string, responseId: string): Promise<Result> {
  const { data: tm, error: day8TmError } = await companyOs
    .from("team_members")
    .select("id")
    .eq("person_id", personId)
    .in("status", LIVE_STATUSES)
    .limit(1)
    .maybeSingle();
  if (day8TmError) return { ok: false, error: `team_members: ${day8TmError.message}` };
  const teamMemberId = (tm as { id: string } | null)?.id;
  if (!teamMemberId) return { ok: true };
  const { data: journey, error: day8JourneyError } = await companyOs
    .from("onboarding_plans")
    .select("id, day8_response_id")
    .eq("team_member_id", teamMemberId)
    .maybeSingle();
  if (day8JourneyError) return { ok: false, error: `onboarding_plans: ${day8JourneyError.message}` };
  const j = journey as { id: string; day8_response_id: string | null } | null;
  if (!j || j.day8_response_id) return { ok: true };
  return patchJourney(j.id, { day8_response_id: responseId });
}


// ---- manual stage moves -----------------------------------------------------
// The stored stage is what the board and list display. Humans set it here (a
// drag or the drawer select); the daily cron only advances it forward with the
// clock, never backward, so a manual move sticks. Setting a stage re-opens a
// completed journey. AUTHORIZATION IS THE CALLER'S JOB.

export async function setJourneyStage(
  journeyId: string,
  stage: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!CYCLE_STAGES.some((s) => s.key === stage)) return { ok: false, error: "Unknown stage." };
  const { data, error } = await companyOs
    .from("onboarding_plans")
    .update({ stage, completed_at: null, updated_at: new Date().toISOString() })
    .eq("id", journeyId)
    .select("team_member_id")
    .maybeSingle();
  if (error) {
    console.error(`[onboarding-cycle] stage move ${journeyId} failed: ${error.message}`);
    return { ok: false, error: "Could not move the stage." };
  }
  if (!data) return { ok: false, error: "Journey not found." };
  // Moving someone out of Preboarding says they have started. Moving them back
  // does not un-start them: status is a fact about employment, not the board.
  if (stage !== "preboarding") {
    const startError = await markStarted((data as { team_member_id: string }).team_member_id);
    if (startError) return { ok: false, error: "The stage moved, but their status could not be set to active." };
  }
  return { ok: true };
}

// A new hire who has reached Day 1 has started: pre_start becomes active and
// pre_boarding becomes probation. Before this, nothing flipped either until the
// Day 60 promotion, so a starter read as not-yet-started for two months and the
// probation screens, which filter on employment_stage = 'probation', never saw
// them. Each update is guarded on the old value, so it is safe to repeat and
// never overwrites on_leave, notice or a later stage. Returns the first error.
export async function markStarted(teamMemberId: string): Promise<string | null> {
  const { error: statusError } = await updateTeamMembers({ status: "active" })
    .eq("id", teamMemberId)
    .eq("status", "pre_start");
  if (statusError) console.error(`[onboarding-cycle] mark started ${teamMemberId}: ${statusError.message}`);
  const { error: stageError } = await updateTeamMembers({ employment_stage: "probation" })
    .eq("id", teamMemberId)
    .eq("employment_stage", "pre_boarding");
  if (stageError) console.error(`[onboarding-cycle] mark probation ${teamMemberId}: ${stageError.message}`);
  return statusError?.message ?? stageError?.message ?? null;
}

// ---- the plan: a pasted link OR an uploaded file ----------------------------
// Managers either paste a link to wherever the plan lives (Google Doc, Lark
// doc...) or upload the document itself — markdown preferred, because .md
// renders readable inside the app (the plan/[id] viewer pages). Exactly one of
// plan_url / plan_path is set at a time: saving one clears the other.
// AUTHORIZATION IS THE CALLER'S JOB — the /team action asserts the journey is
// in the manager's scope first.

export async function savePlanLink(
  journeyId: string,
  url: string,
  addedByTeamMemberId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = externalHref(url);
  if (!normalized) return { ok: false, error: "Paste a valid link (e.g. a Google Doc URL)." };

  const { error } = await companyOs
    .from("onboarding_plans")
    .update({
      plan_url: normalized,
      plan_path: null,
      plan_uploaded_by: addedByTeamMemberId,
      plan_uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", journeyId);
  if (error) return { ok: false, error: "Could not save the plan link." };
  return { ok: true };
}

const PLAN_BUCKET = "onboarding-plans";
export const PLAN_MAX_BYTES = 10 * 1024 * 1024;

const PLAN_MIME_EXT: Record<string, string> = {
  "text/markdown": "md",
  "text/x-markdown": "md",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Browsers report .md files inconsistently (text/plain, empty, octet-stream),
// so the filename extension decides markdown; MIME covers the rest.
function planExtFor(file: File): string | null {
  if (/\.(md|markdown)$/i.test(file.name)) return "md";
  return PLAN_MIME_EXT[file.type] ?? null;
}

export function isMarkdownPlan(path: string): boolean {
  return path.toLowerCase().endsWith(".md");
}

export async function uploadPlanDocument(
  journeyId: string,
  teamMemberId: string,
  uploadedByTeamMemberId: string | null,
  file: File,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ext = planExtFor(file);
  if (!ext) return { ok: false, error: "Use a Markdown file (preferred), PDF, Word doc, or image." };
  if (file.size > PLAN_MAX_BYTES) return { ok: false, error: "File is too large (max 10 MB)." };
  if (file.size === 0) return { ok: false, error: "That file is empty." };

  const folder = `plans/${teamMemberId}`;
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from(PLAN_BUCKET)
    .upload(path, buffer, { contentType: ext === "md" ? "text/markdown" : file.type });
  if (upErr) return { ok: false, error: "Upload failed. Try again." };

  const { error: dbErr } = await companyOs
    .from("onboarding_plans")
    .update({
      plan_path: path,
      plan_url: null,
      plan_uploaded_by: uploadedByTeamMemberId,
      plan_uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", journeyId);
  if (dbErr) return { ok: false, error: "Could not save the plan." };

  // A markdown plan carries its own checklist; seed it so the hire can tick
  // the plan from the /team home. Best effort: the plan is already saved.
  if (ext === "md") await seedPlanTasks(teamMemberId, buffer.toString("utf8"));

  // Best-effort cleanup of previous plan versions; the new one is live.
  const { data: existing, error: listError } = await supabase.storage.from(PLAN_BUCKET).list(folder);
  if (listError) console.error("[onboarding-cycle] plan storage list", listError);
  const stale = (existing ?? []).map((o) => `${folder}/${o.name}`).filter((p) => p !== path);
  if (stale.length > 0) await supabase.storage.from(PLAN_BUCKET).remove(stale);

  return { ok: true };
}

export async function signedPlanUrl(planPath: string): Promise<string | null> {
  const { data, error: signError } = await supabase.storage.from(PLAN_BUCKET).createSignedUrl(planPath, 60);
  if (signError) console.error("[onboarding-cycle] plan storage signed url", signError);
  return data?.signedUrl ?? null;
}

export async function getPlanMarkdown(planPath: string): Promise<string | null> {
  if (!isMarkdownPlan(planPath)) return null;
  const { data, error: downloadError } = await supabase.storage.from(PLAN_BUCKET).download(planPath);
  if (downloadError) console.error("[onboarding-cycle] plan storage download", downloadError);
  if (!data) return null;
  return await data.text();
}

// ---- Day 1 checklist + Day 8 score reads for the board ----------------------

export { getOnboardingTasks, taskCategoryLabel } from "./plan-tasks";

export async function getDay8Scores(responseIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const ids = responseIds.filter(Boolean);
  if (ids.length === 0) return map;
  const { data, error: answersError } = await selectSurveyAnswers("response_id, value")
    .in("response_id", ids);
  if (answersError) console.error("[onboarding-cycle] survey_answers", answersError);
  const sums = new Map<string, { total: number; n: number }>();
  for (const a of (data ?? []) as Array<{ response_id: string; value: string | null }>) {
    const n = Number(a.value);
    if (!Number.isFinite(n)) continue;
    const s = sums.get(a.response_id) ?? { total: 0, n: 0 };
    s.total += n;
    s.n += 1;
    sums.set(a.response_id, s);
  }
  for (const [id, s] of sums) if (s.n > 0) map.set(id, Math.round((s.total / s.n) * 10) / 10);
  return map;
}
