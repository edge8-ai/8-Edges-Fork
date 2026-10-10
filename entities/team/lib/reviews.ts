import { selectCoachingProfiles } from "@/entities/coaching";
import { companyOs, type Json } from "@/kernel/data/supabase";
import { getTeamActor, type TeamActor } from "@/kernel/identity/team-auth";
import { getAccess } from "@/kernel/identity/access-request";

// Performance reviews domain (docs/plans/2026-08-12-performance-reviews.md).
// company_os.performance_reviews is the system of record: one row per subject
// per cycle per rater (self or manager). The survey runner is only the pen;
// submissions land here via each field's maps_to and NEVER create
// survey_responses rows, so review content stays out of every survey surface.
//
// VISIBILITY (enforced here, not in SQL):
//   subject  — their own self rows, and manager rows about them once FINALIZED
//   manager  — rows they review (any status), and the subject's self row only
//              after their own manager row is submitted (blind drafting)
//   observer — the subject's coach and sensitive-cleared admins may READ a
//              review (both sides, once submitted) but never finalize it
// Everything is scoped through the actor from lib/team-auth; ids from the
// client are only ever row ids that these checks re-authorize.

// Client-safe types and label maps live in ./reviews-labels (no server deps);
// re-exported here so server callers keep importing them from "@/entities/team/lib/reviews".
export {
  REVIEW_TYPE_LABEL,
  DECISION_LABEL,
  RATER_LABEL,
  type ReviewType,
  type RaterKind,
  type MemberReviewCycle,
} from "./reviews-labels";
import {
  DECISION_BY_LABEL,
  type ReviewType,
  type RaterKind,
  type MemberReviewCycle,
} from "./reviews-labels";
import { parseStoredAnswer, type SurveyFieldRow } from "@/entities/org";

// The eleven dimensions, in form order. Six Performance Pulse behaviors kept
// verbatim + five AI craft skills (AI Officer curriculum).
export const REVIEW_DIMENSIONS: { key: string; label: string; aiCraft?: boolean }[] = [
  { key: "role_understanding", label: "Role Understanding & Application" },
  { key: "work_quality", label: "Work Quality & Output" },
  { key: "collaboration", label: "Collaboration & Team Fit" },
  { key: "communication", label: "Communication Skills" },
  { key: "problem_solving", label: "Problem-solving" },
  { key: "learning_innovation", label: "Learning & Innovation" },
  { key: "ai_planning", label: "AI Planning", aiCraft: true },
  { key: "workflow_design", label: "Workflow Design", aiCraft: true },
  { key: "organizing_information", label: "Organizing Information", aiCraft: true },
  { key: "creating_instructions", label: "Creating Instructions", aiCraft: true },
  { key: "ai_building", label: "AI Building", aiCraft: true },
];

// Expected AI-craft rating per career level (the mint marker in the runner).
// Same four levels on both tracks; principal expectation is 4 with 5 as the
// stretch, so the marker sits at 4.
export const LEVEL_EXPECTATION: Record<string, number> = {
  junior: 2,
  collaborator: 3,
  senior: 4,
  principal: 4,
};

// The two survey slugs, the field gating, and the link builder are pure and
// live in ./reviews-labels (client-safe, unit-tested); re-exported here.
export { reviewSurveySlug, PERFORMANCE_REVIEW_SLUGS, visibleReviewFields, reviewLinkPath } from "./reviews-labels";
import { reviewSurveySlug } from "./reviews-labels";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

export type ReviewRow = {
  id: string;
  team_member_id: string;
  reviewer_id: string | null;
  cycle_label: string | null;
  review_type: ReviewType;
  rater_kind: RaterKind;
  status: string;
  submitted_at: string | null;
  ratings: Record<string, number>;
  achievements: string | null;
  improvements: string | null;
  comments: string | null;
  decision: string | null;
  keeper: boolean | null;
  metadata: Record<string, unknown>;
  // External reviewers only: who the link is for and the token it carries.
  reviewer_email: string | null;
  reviewer_name: string | null;
  access_token: string | null;
  link_sent_at: string | null;
};

export const REVIEW_COLUMNS =
  "id, team_member_id, reviewer_id, cycle_label, review_type, rater_kind, status, submitted_at, ratings, achievements, improvements, comments, decision, keeper, metadata, reviewer_email, reviewer_name, access_token, link_sent_at";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---- who is who -------------------------------------------------------------

type SubjectInfo = { name: string; careerLevel: string | null; careerTrack: string | null };

async function subjectInfo(teamMemberId: string): Promise<SubjectInfo> {
  const { data, error: subjectError } = await companyOs
    .from("team_members")
    .select(`career_level, career_track, people!person_id(${NAME_COLUMNS})`)
    .eq("id", teamMemberId)
    .maybeSingle();
  if (subjectError) console.error("[team/reviews] team_members", subjectError);
  const p = Array.isArray(data?.people) ? data?.people[0] : data?.people;
  return {
    name: personName(p, "Team member"),
    careerLevel: data?.career_level ?? null,
    careerTrack: data?.career_track ?? null,
  };
}

// ---- runner context: authorize an actor to fill a review row ----------------

export type ReviewRunContext = {
  review: ReviewRow;
  subject: SubjectInfo;
  // The subject's name when the actor is reviewing someone else, null on
  // self-assessments (the runner shows a "Reviewing X" chip from it).
  subjectName: string | null;
  // Where the mint "expected" marker sits on AI-craft scales (1-5), or null
  // when the subject has no career level set.
  expectedLevel: number | null;
};

// Loads a review row and checks the visitor is its rater and it is still
// fillable. Self, manager and team-reviewer rows need the signed-in actor to
// match; an external row needs the token from the link (`?t=`), which is the
// whole credential, so no session is consulted for it. `slug` guards against
// submitting e.g. the mid-year form for a probation row. Returns null (not
// found / not yours / wrong form) or "closed" (already submitted or finalized).
export async function getReviewRunContext(
  reviewId: string,
  slug: string,
  token: string | null = null,
): Promise<ReviewRunContext | "closed" | null> {
  if (!UUID_RE.test(reviewId)) return null;

  const { data, error: runError } = await companyOs
    .from("performance_reviews")
    .select(REVIEW_COLUMNS)
    .eq("id", reviewId)
    .maybeSingle();
  if (runError) console.error("[team/reviews] performance_reviews", runError);
  const review = data as ReviewRow | null;
  if (!review) return null;

  let isRater = false;
  if (review.rater_kind === "external") {
    isRater = !!token && !!review.access_token && token === review.access_token;
  } else {
    const { actor } = await getTeamActor();
    if (!actor) return null;
    isRater =
      review.rater_kind === "self"
        ? review.team_member_id === actor.teamMemberId
        : review.reviewer_id === actor.teamMemberId;
  }
  if (!isRater) return null;
  if (reviewSurveySlug(review) !== slug) return null;
  // Open/draft rows are always fillable. A manager or extra reviewer may
  // additionally re-edit their SUBMITTED review right up until the cycle is
  // finalized; a submitted self-assessment stays closed (the subject does not
  // get to revise it).
  const editable =
    review.status === "open" ||
    review.status === "draft" ||
    (review.rater_kind !== "self" && review.status === "submitted");
  if (!editable) return "closed";

  const subject = await subjectInfo(review.team_member_id);
  return {
    review,
    subject,
    subjectName: review.rater_kind !== "self" ? subject.name : null,
    expectedLevel: subject.careerLevel ? (LEVEL_EXPECTATION[subject.careerLevel] ?? null) : null,
  };
}

// ---- submission: validated survey answers -> the review row -----------------

// Applies a validated submission to the row. Answer values are routed by each
// field's config.maps_to ("performance_reviews.<column>", ".ratings.<dim>", or
// ".metadata.<key>"); anything else is ignored. Caller has already authorized
// via getReviewRunContext and validated via validateAnswer.
export async function applyReviewSubmission(
  review: ReviewRow,
  fields: SurveyFieldRow[],
  answers: Map<string, { value: string; value_json: unknown }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ratings: Record<string, number> = { ...review.ratings };
  const metadata: Record<string, unknown> = { ...review.metadata };
  const patch: Record<string, unknown> = {};

  for (const field of fields) {
    const a = answers.get(field.id);
    if (!a) continue;
    const mapsTo = field.config?.maps_to;
    if (!mapsTo?.startsWith("performance_reviews.")) continue;
    const path = mapsTo.slice("performance_reviews.".length);
    const value = parseStoredAnswer(field, { value: a.value, value_json: a.value_json });

    if (path.startsWith("ratings.")) {
      if (typeof value === "number") ratings[path.slice("ratings.".length)] = value;
    } else if (path.startsWith("metadata.")) {
      metadata[path.slice("metadata.".length)] = value;
    } else if (path === "decision") {
      const decision = DECISION_BY_LABEL[String(value)];
      if (!decision) return { ok: false, error: "Unknown decision option." };
      patch.decision = decision;
    } else if (path === "keeper") {
      if (typeof value === "boolean") patch.keeper = value;
    } else if (path === "achievements" || path === "improvements" || path === "comments") {
      patch[path] = String(value);
    }
  }

  const { error, data } = await companyOs
    .from("performance_reviews")
    .update({
      ...patch,
      // Both are jsonb columns built as open records above.
      ratings: ratings as Json,
      metadata: metadata as Json,
      status: "submitted",
      // Preserve the original submission time when a manager re-edits a
      // already-submitted review; only stamp it on the first submit.
      submitted_at: review.submitted_at ?? new Date().toISOString(),
    })
    .eq("id", review.id)
    // Never overwrite a finalized review; a submitted one may be re-edited by
    // its manager (the run context already gated who may reach here).
    .in("status", ["open", "draft", "submitted"])
    .select("id");
  if (error) return { ok: false, error: "Could not save the review." };
  if (!data?.length) return { ok: false, error: "This review can no longer be edited." };
  return { ok: true };
}

// The inverse of applyReviewSubmission: turn a review row's stored columns back
// into the runner's answer map ({ fieldId: value }) so re-editing a submitted
// review shows the current answers instead of a blank wizard. Value shapes match
// what SurveyRunner holds per field type: rating -> number, single_choice ->
// the option label, yes_no -> boolean, text -> string.
export function reviewInitialAnswers(
  review: ReviewRow,
  fields: SurveyFieldRow[],
): Record<string, unknown> {
  // decision is stored canonical (via DECISION_BY_LABEL); reverse it to the
  // choice label the single_choice field shows.
  const labelByDecision = new Map(
    Object.entries(DECISION_BY_LABEL).map(([label, value]) => [value, label]),
  );
  const answers: Record<string, unknown> = {};
  for (const field of fields) {
    const mapsTo = field.config?.maps_to;
    if (!mapsTo?.startsWith("performance_reviews.")) continue;
    const path = mapsTo.slice("performance_reviews.".length);

    if (path.startsWith("ratings.")) {
      const v = review.ratings?.[path.slice("ratings.".length)];
      if (typeof v === "number") answers[field.id] = v;
    } else if (path === "achievements" || path === "improvements" || path === "comments") {
      if (typeof review[path] === "string" && review[path]) answers[field.id] = review[path];
    } else if (path === "decision") {
      if (review.decision) {
        const label = labelByDecision.get(review.decision);
        if (label) answers[field.id] = label;
      }
    } else if (path === "keeper") {
      if (typeof review.keeper === "boolean") answers[field.id] = review.keeper;
    } else if (path.startsWith("metadata.")) {
      const v = review.metadata?.[path.slice("metadata.".length)];
      if (v !== undefined && v !== null) answers[field.id] = v;
    }
  }
  return answers;
}

// ---- lists for /team/reviews ------------------------------------------------

export type ReviewListItem = {
  id: string;
  cycleLabel: string | null;
  reviewType: ReviewType;
  raterKind: RaterKind;
  status: string;
  submittedAt: string | null;
  subjectName: string;
  decision: string | null;
};

async function withSubjectNames(rows: ReviewRow[]): Promise<ReviewListItem[]> {
  const ids = [...new Set(rows.map((r) => r.team_member_id))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data, error: namesError } = await companyOs
      .from("team_members")
      .select(`id, people!person_id(${NAME_COLUMNS})`)
      .in("id", ids);
    if (namesError) console.error("[team/reviews] team_members", namesError);
    for (const tm of (data ?? []) as Array<{ id: string; people: unknown }>) {
      const p = (Array.isArray(tm.people) ? tm.people[0] : tm.people) as NamedPerson | null;
      names.set(tm.id, personName(p, "Team member"));
    }
  }
  return rows.map((r) => ({
    id: r.id,
    cycleLabel: r.cycle_label,
    reviewType: r.review_type,
    raterKind: r.rater_kind,
    status: r.status,
    submittedAt: r.submitted_at,
    subjectName: names.get(r.team_member_id) ?? "Team member",
    decision: r.decision,
  }));
}

export type ReviewLists = {
  // Reviews the actor still owes: their own open self-assessments plus open
  // manager reviews of their reports.
  todo: ReviewListItem[];
  // Manager rows the actor submitted (awaiting finalize) or finalized.
  reports: ReviewListItem[];
  // The actor's own history: finalized manager reviews about them + their own
  // submitted self-assessments.
  mine: ReviewListItem[];
};

export async function listReviews(actor: TeamActor): Promise<ReviewLists> {
  const [own, reviewing] = await Promise.all([
    companyOs
      .from("performance_reviews")
      .select(REVIEW_COLUMNS)
      .eq("team_member_id", actor.teamMemberId)
      .order("submitted_at", { ascending: false, nullsFirst: true }),
    companyOs
      .from("performance_reviews")
      .select(REVIEW_COLUMNS)
      .eq("reviewer_id", actor.teamMemberId)
      .in("rater_kind", ["manager", "reviewer"])
      .order("submitted_at", { ascending: false, nullsFirst: true }),
  ]);
  const ownRows = (own.data ?? []) as ReviewRow[];
  // Someone who is their own reviewer-of-record (the founder) appears in both
  // queries; de-dup by row id so each row lists once, in the reviewing bucket.
  const reviewingRows = (reviewing.data ?? []) as ReviewRow[];
  const reviewingIds = new Set(reviewingRows.map((r) => r.id));

  const todo = [
    ...ownRows.filter(
      (r) =>
        r.rater_kind === "self" &&
        (r.status === "open" || r.status === "draft") &&
        !reviewingIds.has(r.id),
    ),
    ...reviewingRows.filter((r) => r.status === "open" || r.status === "draft"),
  ];
  const reports = reviewingRows.filter((r) => r.status === "submitted" || r.status === "finalized");
  const mine = [
    ...ownRows.filter(
      (r) => r.rater_kind === "manager" && r.status === "finalized" && !reviewingIds.has(r.id),
    ),
    ...ownRows.filter((r) => r.rater_kind === "self" && r.status === "submitted"),
  ];
  const [todoL, reportsL, mineL] = await Promise.all([
    withSubjectNames(todo),
    withSubjectNames(reports),
    withSubjectNames(mine),
  ]);
  return { todo: todoL, reports: reportsL, mine: mineL };
}

// ---- detail: one cycle, both sides, visibility-checked ----------------------

export type ReviewDetail = {
  anchor: ReviewRow; // the row the id addressed
  subjectName: string;
  expectedLevel: number | null;
  careerLevel: string | null;
  // The two sides, after visibility rules. Either may be null.
  self: ReviewRow | null;
  manager: ReviewRow | null;
  // Reviews by reviewers beyond the manager (team or external), after
  // visibility rules: the manager and observers see them once submitted; an
  // extra reviewer sees only their own; the subject sees none.
  others: ReviewRow[];
  // The actor's relationship to this cycle.
  isSubject: boolean;
  isReviewer: boolean;
  canFinalize: boolean;
};

// A non-participant who may still READ this subject's reviews: the coach who
// owns their coaching profile, or a holder of people.pay, which covers reviews'
// pay fields and which Super Admin holds by declaration (ADR 0014). Read
// only — finalizeReview re-checks reviewer_id, so observers can never finalize.
async function canObserveReview(actor: TeamActor, subjectTeamMemberId: string): Promise<boolean> {
  if ((await getAccess())?.may("people.pay")) return true;
  const { data, error: coachError } = await selectCoachingProfiles("id")
    .eq("coach_id", actor.teamMemberId)
    .eq("team_member_id", subjectTeamMemberId)
    .maybeSingle();
  if (coachError) console.error("[team/reviews] coaching_profiles", coachError);
  return !!data;
}

export async function getReviewDetail(actor: TeamActor, id: string): Promise<ReviewDetail | null> {
  if (!UUID_RE.test(id)) return null;
  const { data, error: anchorError } = await companyOs
    .from("performance_reviews")
    .select(REVIEW_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (anchorError) console.error("[team/reviews] performance_reviews", anchorError);
  const anchor = data as ReviewRow | null;
  if (!anchor) return null;

  // Every row of the cycle (same subject + cycle_label): self, manager, and any
  // extra reviewers. A legacy row without a cycle label stands alone.
  let cycleRows: ReviewRow[] = [anchor];
  if (anchor.cycle_label) {
    const { data: rows, error: rowsError } = await companyOs
      .from("performance_reviews")
      .select(REVIEW_COLUMNS)
      .eq("team_member_id", anchor.team_member_id)
      .eq("cycle_label", anchor.cycle_label);
    if (rowsError) console.error("[team/reviews] performance_reviews", rowsError);
    if (rows?.length) cycleRows = rows as ReviewRow[];
  }
  const selfRow = cycleRows.find((r) => r.rater_kind === "self") ?? null;
  const managerRow = cycleRows.find((r) => r.rater_kind === "manager") ?? null;
  const otherRows = cycleRows.filter((r) => r.rater_kind === "reviewer" || r.rater_kind === "external");

  // Not mutually exclusive: someone who is their own reviewer-of-record (the
  // founder) holds both roles and sees both sides. "Reviewer" here means the
  // manager-of-record; an extra reviewer is a narrower role below.
  const isSubject = anchor.team_member_id === actor.teamMemberId;
  const isReviewer = managerRow?.reviewer_id === actor.teamMemberId;
  const ownExtraRows = otherRows.filter(
    (r) => r.rater_kind === "reviewer" && r.reviewer_id === actor.teamMemberId,
  );
  const isExtraReviewer = !isSubject && !isReviewer && ownExtraRows.length > 0;
  // Participants aside, the subject's coach and sensitive admins may observe.
  const isObserver =
    !isSubject && !isReviewer && !isExtraReviewer && (await canObserveReview(actor, anchor.team_member_id));
  if (!isSubject && !isReviewer && !isExtraReviewer && !isObserver) return null;

  // Visibility:
  //   subject:  own self row always; manager row only once finalized
  //   reviewer: own manager row always; self row only after they submitted
  //             (blind drafting), and only submitted self content
  //   observer: both sides, but only once each is submitted (never raw drafts)
  const managerDone = managerRow?.status === "submitted" || managerRow?.status === "finalized";
  const selfDone = selfRow?.status === "submitted" || selfRow?.status === "finalized";
  const visibleSelf = isSubject
    ? selfRow
    : isReviewer && managerDone && selfRow?.status === "submitted"
      ? selfRow
      : isObserver && selfDone
        ? selfRow
        : null;
  // The reviewer always sees their own review; the subject only a finalized one;
  // an observer any submitted-or-finalized one.
  const visibleManager = isReviewer
    ? managerRow
    : isSubject && managerRow?.status === "finalized"
      ? managerRow
      : isObserver && managerDone
        ? managerRow
        : null;
  // Extra reviews: the manager and observers read them once submitted, an
  // extra reviewer reads only their own, the subject reads none of them.
  const submittedOthers = otherRows.filter((r) => r.status === "submitted" || r.status === "finalized");
  const visibleOthers = isExtraReviewer ? ownExtraRows : isReviewer || isObserver ? submittedOthers : [];
  if (!visibleSelf && !visibleManager && visibleOthers.length === 0) return null;

  const subject = await subjectInfo(anchor.team_member_id);
  return {
    anchor,
    subjectName: subject.name,
    careerLevel: subject.careerLevel,
    expectedLevel: subject.careerLevel ? (LEVEL_EXPECTATION[subject.careerLevel] ?? null) : null,
    self: visibleSelf,
    manager: visibleManager,
    others: visibleOthers,
    isSubject,
    isReviewer,
    canFinalize: isReviewer && managerRow?.status === "submitted",
  };
}

// Finalize a submitted manager review. Probation and renewal require a
// decision; mid-year requires the keeper answer. Once finalized the subject
// can see it.
export async function finalizeReview(
  actor: TeamActor,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!UUID_RE.test(id)) return { ok: false, error: "Not found." };
  const { data, error: loadError } = await companyOs
    .from("performance_reviews")
    .select(REVIEW_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (loadError) console.error("[team/reviews] performance_reviews", loadError);
  const row = data as ReviewRow | null;
  if (!row || row.reviewer_id !== actor.teamMemberId || row.rater_kind !== "manager")
    return { ok: false, error: "Not found." };
  if (row.status !== "submitted") return { ok: false, error: "Only a submitted review can be finalized." };
  if ((row.review_type === "probation" || row.review_type === "renewal") && !row.decision)
    return { ok: false, error: "A decision is required before finalizing." };
  if (row.review_type === "midyear" && row.keeper === null)
    return { ok: false, error: "The keeper question is required before finalizing." };

  const { error } = await companyOs
    .from("performance_reviews")
    .update({ status: "finalized" })
    .eq("id", id)
    .eq("status", "submitted");
  if (error) return { ok: false, error: "Could not finalize." };
  return { ok: true };
}

// ---- cycle creation (used by the scheduler in PR 3 and by admin tooling) ----

// Opens a review cycle: a self row for the subject and a manager row for their
// manager-of-record. Rows that already exist for the cycle label are reused, so
// it is safe to call twice; both ids come back so the caller can link to each form.
export async function openReviewCycle(input: {
  teamMemberId: string;
  managerId: string;
  reviewType: Exclude<ReviewType, "annual">;
  cycleLabel: string;
}): Promise<{ created: number; selfId: string | null; managerId: string | null }> {
  const base = {
    team_member_id: input.teamMemberId,
    cycle_label: input.cycleLabel,
    review_type: input.reviewType,
    rating_scale: "anchored-v1",
    status: "open",
    source: "portal",
  };
  const specs = [
    { rater_kind: "self" as const, reviewer_id: input.teamMemberId },
    { rater_kind: "manager" as const, reviewer_id: input.managerId },
  ];
  let created = 0;
  const ids: Record<"self" | "manager", string | null> = { self: null, manager: null };
  // The cycle's rows in one read; the loop used to ask once per rater kind.
  const { data: existingRows, error: existingError } = await companyOs
    .from("performance_reviews")
    .select("id, rater_kind")
    .eq("team_member_id", input.teamMemberId)
    .eq("cycle_label", input.cycleLabel);
  if (existingError) console.error("[team/reviews] performance_reviews", existingError);
  const existingRaters = (existingRows ?? []) as Array<{ id: string; rater_kind: string }>;
  for (const spec of specs) {
    const existing = existingRaters.find((r) => r.rater_kind === spec.rater_kind);
    if (existing) {
      ids[spec.rater_kind] = existing.id;
      continue;
    }
    const { data, error } = await companyOs
      .from("performance_reviews")
      .insert({ ...base, ...spec })
      .select("id")
      .single();
    if (!error && data) {
      ids[spec.rater_kind] = (data as { id: string }).id;
      created++;
    }
  }
  return { created, selfId: ids.self, managerId: ids.manager };
}

// ---- schedule: when is a member's next review due? --------------------------

// The pure date arithmetic and the scheduling rules live in ./review-schedule
// (no IO, unit-tested there); re-exported so server callers keep importing them
// from "@/entities/team/lib/reviews".
export {
  computeNextReview,
  reviewMomentsInWindow,
  type ScheduledMoment,
} from "./review-schedule";

// ---- admin: one member's full review history (no visibility scoping) --------

// Admin/talent view of a member's reviews, grouped by cycle. Both sides of a
// cycle collapse into one row (self ✓ / manager ✓). Unlike the team-portal
// lists, this is unscoped: the caller (requireAdmin) is the boundary.
// The MemberReviewCycle shape lives in ./reviews-labels (client-safe).

const STATUS_RANK: Record<string, number> = {
  open: 0,
  draft: 1,
  submitted: 2,
  finalized: 3,
  acknowledged: 4,
};

export async function getMemberReviewHistory(teamMemberId: string): Promise<MemberReviewCycle[]> {
  if (!UUID_RE.test(teamMemberId)) return [];
  const { data, error: historyError } = await companyOs
    .from("performance_reviews")
    .select(REVIEW_COLUMNS)
    .eq("team_member_id", teamMemberId)
    .order("submitted_at", { ascending: false, nullsFirst: true });
  if (historyError) console.error("[team/reviews] performance_reviews", historyError);
  const rows = (data ?? []) as ReviewRow[];

  // Group by cycle. Legacy imports may share no cycle_label shape with portal
  // rows, and each legacy row is its own cycle, so fall back to the row id.
  const byCycle = new Map<string, ReviewRow[]>();
  for (const r of rows) {
    const key = r.cycle_label ?? `row:${r.id}`;
    const arr = byCycle.get(key) ?? [];
    arr.push(r);
    byCycle.set(key, arr);
  }

  const cycles: MemberReviewCycle[] = [];
  for (const [, group] of byCycle) {
    const self = group.find((r) => r.rater_kind === "self") ?? null;
    const manager = group.find((r) => r.rater_kind === "manager") ?? null;
    const extraReviewers = group.filter((r) => r.rater_kind === "reviewer" || r.rater_kind === "external").length;
    const anchor = manager ?? self ?? group[0];
    const status = group.reduce(
      (best, r) => ((STATUS_RANK[r.status] ?? 0) > (STATUS_RANK[best] ?? 0) ? r.status : best),
      group[0].status,
    );
    const date = group
      .map((r) => r.submitted_at)
      .filter((d): d is string => !!d)
      .sort()
      .at(-1) ?? null;
    cycles.push({
      cycleLabel: anchor.cycle_label,
      reviewType: anchor.review_type,
      date,
      hasSelf: !!self,
      hasManager: !!manager,
      extraReviewers,
      status,
      decision: manager?.decision ?? null,
      keeper: manager?.keeper ?? null,
      linkId: anchor.id,
    });
  }
  // Newest first; undated (open) cycles sink to the bottom.
  cycles.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return cycles;
}

export async function hasProbationReview(teamMemberId: string): Promise<boolean> {
  const { data, error: probationError } = await companyOs
    .from("performance_reviews")
    .select("id")
    .eq("team_member_id", teamMemberId)
    .eq("review_type", "probation")
    .limit(1);
  if (probationError) console.error("[team/reviews] performance_reviews", probationError);
  return (data ?? []).length > 0;
}
