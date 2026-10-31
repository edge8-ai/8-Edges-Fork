import { companyOs, type Json } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { REVIEW_DIMENSIONS } from "../reviews";

// Quarterly reviews (Coaching Mirror, Build 2). A coach's quarterly review of
// one person is the cycle's `manager` row: rater_kind "manager" means the rater
// who finalizes, and for a quarterly cycle that is the person's coach. So the
// rules reviews.ts already enforces apply unchanged: the coach reads their own
// row in any status, and the person reads it only once it is finalized.
//
// The steps map onto the statuses the table already has:
//   draft      the AI draft, which the coach edits
//   submitted  approved (a coaching.everyone holder, Dave, signs it off)
//   finalized  discussed in the room with the person, who can now read it
//   acknowledged  the person has read it
//
// The draft is never written through the survey runner (getReviewRunContext
// refuses a quarterly row), so "submitted" can only be reached by approve below.
//
// AUTHORIZATION IS THE CALLER'S JOB. These run on the service-role client; the
// coaching route that calls them checks the actor is the person's coach or
// holds coaching.everyone, and only the latter may approve.

export type QuarterlyStatus = "draft" | "submitted" | "finalized" | "acknowledged";

export type QuarterlyMeta = {
  evidence: Record<string, string>;
  suggested_commitments: string[];
  ai_model: string | null;
  generated_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
};

export type QuarterlyReview = {
  id: string;
  teamMemberId: string;
  reviewerId: string | null;
  status: string;
  ratings: Record<string, number>;
  achievements: string | null;
  improvements: string | null;
  // The overall paragraph, each claim tagged with its source.
  comments: string | null;
  quarterly: QuarterlyMeta;
};

export type QuarterlyDraft = {
  comments: string;
  ratings: Record<string, number>;
  evidence: Record<string, string>;
  achievements: string;
  improvements: string;
  suggestedCommitments: string[];
};

type Result = { ok: true } | { ok: false; error: string };

const COLUMNS = "id, team_member_id, reviewer_id, rater_kind, status, ratings, achievements, improvements, comments, metadata";

/** The cycle label every row of one person's quarterly review carries. */
export function quarterlyCycleLabel(quarter: string): string {
  return `${quarter} quarterly`;
}

const EMPTY_META: QuarterlyMeta = {
  evidence: {},
  suggested_commitments: [],
  ai_model: null,
  generated_at: null,
  approved_by: null,
  approved_at: null,
};

type Row = {
  id: string;
  team_member_id: string;
  reviewer_id: string | null;
  rater_kind: string;
  status: string;
  ratings: Record<string, number> | null;
  achievements: string | null;
  improvements: string | null;
  comments: string | null;
  metadata: Record<string, unknown> | null;
};

function toReview(r: Row): QuarterlyReview {
  const q = (r.metadata?.quarterly ?? {}) as Partial<QuarterlyMeta>;
  return {
    id: r.id,
    teamMemberId: r.team_member_id,
    reviewerId: r.reviewer_id,
    status: r.status,
    ratings: r.ratings ?? {},
    achievements: r.achievements,
    improvements: r.improvements,
    comments: r.comments,
    quarterly: { ...EMPTY_META, ...q },
  };
}

/** Each person's quarterly review status, by team member id, for the Team signals table. */
export async function quarterlyStatusesFor(teamMemberIds: string[], quarter: string): Promise<Map<string, { id: string; status: string }>> {
  if (teamMemberIds.length === 0) return new Map();
  const rows = mustRows(
    await companyOs
      .from("performance_reviews")
      .select("id, team_member_id, status")
      .in("team_member_id", teamMemberIds)
      .eq("cycle_label", quarterlyCycleLabel(quarter))
      .eq("rater_kind", "manager"),
    "[team/quarterly] performance_reviews",
  ) as { id: string; team_member_id: string; status: string }[];
  return new Map(rows.map((r) => [r.team_member_id, { id: r.id, status: r.status }]));
}

/**
 * One person's quarterly review: the coach's row in any status, and their own
 * self-assessment only once they submitted it (a draft of theirs is theirs).
 */
export async function getQuarterlyReview(
  teamMemberId: string,
  quarter: string,
): Promise<{ coach: QuarterlyReview | null; self: QuarterlyReview | null }> {
  const rows = mustRows(
    await companyOs
      .from("performance_reviews")
      .select(COLUMNS)
      .eq("team_member_id", teamMemberId)
      .eq("cycle_label", quarterlyCycleLabel(quarter))
      .in("rater_kind", ["manager", "self"]),
    "[team/quarterly] performance_reviews",
  ) as unknown as Row[];
  const coach = rows.find((r) => r.rater_kind === "manager");
  const self = rows.find((r) => r.rater_kind === "self" && (r.status === "submitted" || r.status === "finalized"));
  return { coach: coach ? toReview(coach) : null, self: self ? toReview(self) : null };
}

/** Keep only known dimensions rated 1 to 5. */
function cleanRatings(ratings: Record<string, number>): Record<string, number> {
  const keys = new Set(REVIEW_DIMENSIONS.map((d) => d.key));
  return Object.fromEntries(
    Object.entries(ratings).filter(([k, v]) => keys.has(k) && Number.isInteger(v) && v >= 1 && v <= 5),
  );
}

/**
 * Write the AI draft onto the coach's row, creating it on the first draft. A
 * redraft replaces the draft; once approved, the row is no longer a draft and
 * this refuses rather than overwrite what was signed off.
 */
export async function saveQuarterlyDraft(input: {
  teamMemberId: string;
  coachId: string;
  quarter: string;
  draft: QuarterlyDraft;
  aiModel: string | null;
}): Promise<Result & { id?: string }> {
  const cycle = quarterlyCycleLabel(input.quarter);
  const { coach } = await getQuarterlyReview(input.teamMemberId, input.quarter);
  if (coach && coach.status !== "draft" && coach.status !== "open") {
    return { ok: false, error: "This review is already approved, so it can no longer be redrafted." };
  }
  const quarterly: QuarterlyMeta = {
    ...EMPTY_META,
    evidence: input.draft.evidence,
    suggested_commitments: input.draft.suggestedCommitments,
    ai_model: input.aiModel,
    generated_at: new Date().toISOString(),
  };
  const fields = {
    reviewer_id: input.coachId,
    status: "draft",
    ratings: cleanRatings(input.draft.ratings) as Json,
    achievements: input.draft.achievements,
    improvements: input.draft.improvements,
    comments: input.draft.comments,
  };
  if (coach) {
    const { data, error } = await companyOs
      .from("performance_reviews")
      .update({ ...fields, metadata: { quarterly } as unknown as Json })
      .eq("id", coach.id)
      .in("status", ["open", "draft"])
      .select("id");
    if (error) return { ok: false, error: "Could not save the draft." };
    if (!data?.length) return { ok: false, error: "This review is already approved, so it can no longer be redrafted." };
    return { ok: true, id: coach.id };
  }
  const { data, error } = await companyOs
    .from("performance_reviews")
    .insert({
      ...fields,
      team_member_id: input.teamMemberId,
      cycle_label: cycle,
      review_type: "quarterly",
      rater_kind: "manager",
      rating_scale: "anchored-v1",
      source: "portal",
      metadata: { quarterly } as unknown as Json,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Could not save the draft." };
  return { ok: true, id: (data as { id: string }).id };
}

/** The coach's edits to a draft. Only a draft can be edited. */
export async function editQuarterlyDraft(
  id: string,
  patch: { comments: string; achievements: string; improvements: string; ratings: Record<string, number>; evidence: Record<string, string> },
): Promise<Result> {
  const { data: current, error: readError } = await companyOs
    .from("performance_reviews")
    .select("metadata, status, review_type")
    .eq("id", id)
    .maybeSingle();
  if (readError) return { ok: false, error: "Could not load the review." };
  const row = current as { metadata: Record<string, unknown> | null; status: string; review_type: string } | null;
  if (!row || row.review_type !== "quarterly") return { ok: false, error: "Not found." };
  if (row.status !== "draft") return { ok: false, error: "Only a draft can be edited." };
  const quarterly = { ...EMPTY_META, ...((row.metadata?.quarterly ?? {}) as Partial<QuarterlyMeta>), evidence: patch.evidence };
  const { data, error } = await companyOs
    .from("performance_reviews")
    .update({
      comments: patch.comments,
      achievements: patch.achievements,
      improvements: patch.improvements,
      ratings: cleanRatings(patch.ratings) as Json,
      metadata: { ...(row.metadata ?? {}), quarterly } as unknown as Json,
    })
    .eq("id", id)
    .eq("status", "draft")
    .select("id");
  if (error) return { ok: false, error: "Could not save." };
  if (!data?.length) return { ok: false, error: "Only a draft can be edited." };
  return { ok: true };
}

/** Sign a draft off: draft becomes submitted, stamped with who approved it. */
export async function approveQuarterlyReview(id: string, approverId: string): Promise<Result> {
  const { data: current, error: readError } = await companyOs
    .from("performance_reviews")
    .select("metadata, status, review_type, comments")
    .eq("id", id)
    .maybeSingle();
  if (readError) return { ok: false, error: "Could not load the review." };
  const row = current as { metadata: Record<string, unknown> | null; status: string; review_type: string; comments: string | null } | null;
  if (!row || row.review_type !== "quarterly") return { ok: false, error: "Not found." };
  if (row.status !== "draft") return { ok: false, error: "Only a draft can be approved." };
  if (!row.comments?.trim()) return { ok: false, error: "The review has no summary yet." };
  const now = new Date().toISOString();
  const quarterly = {
    ...EMPTY_META,
    ...((row.metadata?.quarterly ?? {}) as Partial<QuarterlyMeta>),
    approved_by: approverId,
    approved_at: now,
  };
  const { data, error } = await companyOs
    .from("performance_reviews")
    .update({ status: "submitted", submitted_at: now, metadata: { ...(row.metadata ?? {}), quarterly } as unknown as Json })
    .eq("id", id)
    .eq("status", "draft")
    .select("id");
  if (error) return { ok: false, error: "Could not approve." };
  if (!data?.length) return { ok: false, error: "Only a draft can be approved." };
  return { ok: true };
}
