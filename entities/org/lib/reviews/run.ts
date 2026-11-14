import { companyOs, type Json } from "@/kernel/data/supabase";
import { ReadFailure } from "@/kernel/data/read";
import { getTeamActor } from "@/kernel/identity/team-auth";
import { isUuid } from "@/kernel/config/slug";
import { publish } from "@/kernel/events";
import { LEVEL_EXPECTATION, REVIEW_COLUMNS, subjectInfo, type ReviewRow, type SubjectInfo } from "../reviews";
import { DECISION_BY_LABEL, reviewSurveySlug } from "../reviews-labels";
import { parseStoredAnswer, type SurveyFieldRow } from "../surveys-schema";
import { answerPath, storedAnswer, type AnswerPath, type StoredAnswers } from "../review-answer-path";
import { clientPartAccess, wasReopened } from "../client-reviews/access";
import { partSentNotice } from "../client-reviews/part-sent";

// The survey runner as the pen for a review row: who may fill a row, how a
// submission lands on it, and how a sent row is read back into the form. It
// moved out of ../reviews.ts when that file reached its size cap (CR.2.2); it
// imports that module and is never imported by it, so the two form no cycle.

/**
 * A client review part, asked of the rules module through ../client-reviews/access.
 * A part already sent reads as "closed", which the page answers with the sent
 * answers or a plain message; any other refusal reads as not found, so a link
 * that does not work learns nothing about the review behind it.
 */
async function clientRunContext(review: ReviewRow, slug: string, token: string | null, personIds: readonly string[]): Promise<ReviewRunContext | "closed" | null> {
  if (reviewSurveySlug(review) !== slug) return null;
  const actor = review.rater_kind === "self" ? (await getTeamActor()).actor : null;
  const access = await clientPartAccess(review, { token, teamMemberId: actor?.teamMemberId ?? null, personIds });
  if (!access.ok) return access.reason === "already_submitted" ? "closed" : null;
  const subject = await subjectInfo(review.team_member_id);
  return { review, subject, subjectName: review.rater_kind === "self" ? null : subject.name, expectedLevel: null, reopened: wasReopened(review) };
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
  /** A client part the owner put back to open (CR.2.4): it keeps its answers, so the form opens with them. */
  reopened?: boolean;
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
  // Every people row of the signed-in visitor: a client manager may fill
  // their part by signing in instead of by link (CR.3.6).
  personIds: readonly string[] = [],
): Promise<ReviewRunContext | "closed" | null> {
  if (!isUuid(reviewId)) return null;

  const { data, error: runError } = await companyOs
    .from("performance_reviews")
    .select(REVIEW_COLUMNS)
    .eq("id", reviewId)
    .maybeSingle();
  if (runError) throw new ReadFailure("[team/reviews] performance_reviews", runError.message);
  const review = data as ReviewRow | null;
  if (!review) return null;
  // A client review is decided by its rules module, not by the checks below:
  // the client manager is known by their link's token or by signing in with
  // portal access at the cycle's client (CR.3.6), and never re-edits a sent
  // part, and a closed cycle or a withdrawn member locks every part (CR.2.2).
  if (review.review_type === "client") return clientRunContext(review, slug, token, personIds);

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
  // A coach's quarterly review is approved on the coaching page, never submitted here (reviews/quarterly.ts).
  if (review.review_type === "quarterly" && review.rater_kind !== "self") return null;
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
    const path = answerPath(field.config?.maps_to);
    if (!path) continue;
    const value = parseStoredAnswer(field, { value: a.value, value_json: a.value_json });

    if (path.at === "ratings") {
      if (typeof value === "number") ratings[path.key] = value;
    } else if (path.at === "metadata") {
      metadata[path.key] = value;
    } else if (path.at === "decision") {
      const decision = DECISION_BY_LABEL[String(value)];
      if (!decision) return { ok: false, error: "Unknown decision option." };
      patch.decision = decision;
    } else if (path.at === "keeper") {
      if (typeof value === "boolean") patch.keeper = value;
    } else {
      patch[path.column] = String(value);
    }
  }

  const sentAt = new Date().toISOString();
  const { error, data } = await companyOs
    .from("performance_reviews")
    .update({
      ...patch,
      // Both are jsonb columns built as open records above.
      ratings: ratings as Json,
      metadata: metadata as Json,
      status: "submitted",
      // Preserve the original submission time when a manager re-edits a
      // already-submitted review; only stamp it on the first submit. A client
      // part is signed by its two confirmations, ticked afresh on every send
      // (a reopened part asks for them again), so its time is always this
      // send's; reopening kept the earlier time on the part (owner-actions).
      submitted_at: review.review_type === "client" ? sentAt : (review.submitted_at ?? sentAt),
    })
    .eq("id", review.id)
    // Never overwrite a finalized review; a submitted one may be re-edited by
    // its manager (the run context already gated who may reach here).
    // A client review part is locked once sent: nobody re-edits it here, and
    // only the owner reopening it (recorded) puts it back to open.
    .in("status", review.review_type === "client" ? ["open", "draft"] : ["open", "draft", "submitted"])
    .select("id");
  if (error) return { ok: false, error: "Could not save the review." };
  if (!data?.length) return { ok: false, error: "This review can no longer be edited." };
  // The part is in, so the inbox settles its ask (TH.8.3), and a client part
  // tells the person who opened its cycle (CR.2.6). Neither failure fails the
  // submission: a notice that cannot be read is left off, and the ask is
  // still settled.
  const client =
    review.review_type === "client"
      ? await partSentNotice(review, sentAt).catch((err: unknown) => {
          console.error(`[reviews] ${review.id} owner not told:`, err);
          return null;
        })
      : null;
  await publish("review.part.submitted", { reviewId: review.id, ...(client ? { client } : {}) }).catch((err: unknown) =>
    console.error(`[reviews] ${review.id} not stated:`, err),
  );
  return { ok: true };
}

/** The columns a sent review's answers are read back from. A client part's row has them too, without the company form's decision. */
export type AnswerColumns = StoredAnswers & {
  decision?: string | null;
  keeper?: boolean | null;
};

/** Whether a stored value is an answer the form can show: a number for a rating, words for a text column, anything set in the metadata. */
function isAnswered(path: AnswerPath, v: unknown): boolean {
  if (path.at === "ratings") return typeof v === "number";
  if (path.at === "column") return typeof v === "string" && v !== "";
  return v !== undefined && v !== null;
}

// The inverse of applyReviewSubmission: turn a review row's stored columns back
// into the runner's answer map ({ fieldId: value }) so re-editing a submitted
// review shows the current answers instead of a blank wizard. Value shapes match
// what SurveyRunner holds per field type: rating -> number, single_choice ->
// the option label, yes_no -> boolean, text -> string.
//
// A question that must be ticked to send (must_accept: a client review's two
// confirmations) is never ticked for the person. Ticking it is the signature,
// and a part opened again for a correction is signed again when it is sent.
export function reviewInitialAnswers(
  review: AnswerColumns,
  fields: readonly SurveyFieldRow[],
): Record<string, unknown> {
  // decision is stored canonical (via DECISION_BY_LABEL); reverse it to the
  // choice label the single_choice field shows.
  const labelByDecision = new Map(
    Object.entries(DECISION_BY_LABEL).map(([label, value]) => [value, label]),
  );
  const answers: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.config?.must_accept) continue;
    const path = answerPath(field.config?.maps_to);
    if (!path) continue;

    if (path.at === "decision") {
      const label = review.decision ? labelByDecision.get(review.decision) : undefined;
      if (label) answers[field.id] = label;
    } else if (path.at === "keeper") {
      if (typeof review.keeper === "boolean") answers[field.id] = review.keeper;
    } else {
      const v = storedAnswer(review, path);
      if (isAnswered(path, v)) answers[field.id] = v;
    }
  }
  return answers;
}
