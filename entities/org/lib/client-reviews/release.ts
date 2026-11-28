import { companyOs } from "@/kernel/data/supabase";
import type { Result } from "@/kernel/data/result";
import { audit, reviewFor, type Actor } from "./owner-actions";

// The owner's last steps on one member's client review (CR.3.3, stories 50 to
// 52): write the HR summary, waive the skip-manager's mark when they will not
// give it, and release. Each asks ./owner-rules through reviewFor, which also
// refuses anyone acting on their own review. A waiver and a release each leave
// an audit record (spec, "Commands"). A closed cycle still allows all three,
// because closing only stops the links.
//
// Each write is guarded on the row still being as the rule saw it, so two
// tabs, or a release landing between a read and a write, cannot release twice
// or change a released summary.

/** The longest summary kept: a summary is a few paragraphs, not a document. */
const SUMMARY_MAX = 6000;

const RELEASED_JUST_NOW = "This review was released just now. Reload to see it.";

/** Saves the owner's HR summary of one member's review, or clears it. Never after release. */
export async function saveHrSummary(cycleId: string, teamMemberId: string, text: string, by: Actor): Promise<Result> {
  if (text.length > SUMMARY_MAX) return { ok: false, error: `A summary can be at most ${SUMMARY_MAX} characters.` };
  const review = await reviewFor(cycleId, teamMemberId, by, "edit_summary");
  if (!review.ok) return review;
  const { data, error } = await companyOs
    .from("review_cycle_members")
    .update({ hr_summary: text.trim() || null })
    .eq("cycle_id", review.cycle.id)
    .eq("team_member_id", teamMemberId)
    .is("released_at", null)
    .select("team_member_id");
  if (error) return { ok: false, error: "The summary could not be saved." };
  if (!data?.length) return { ok: false, error: RELEASED_JUST_NOW };
  return { ok: true };
}

/**
 * Waives the skip-manager's Reviewed mark for one member, so their release no
 * longer waits for it (story 52). The skip-manager may still read and note
 * the member until they mark it or the cycle closes; the waiver only frees
 * the release.
 */
export async function waiveSkipManagerMark(cycleId: string, teamMemberId: string, by: Actor): Promise<Result> {
  const review = await reviewFor(cycleId, teamMemberId, by, "waive_skip");
  if (!review.ok) return review;
  const { data, error } = await companyOs
    .from("review_cycle_members")
    .update({ skip_waived_at: new Date().toISOString(), skip_waived_by: by.personId })
    .eq("cycle_id", review.cycle.id)
    .eq("team_member_id", teamMemberId)
    .is("skip_waived_at", null)
    .is("released_at", null)
    .select("team_member_id");
  if (error) return { ok: false, error: "The waiver could not be saved." };
  if (!data?.length) return { ok: false, error: "This member's mark was waived or the review released just now. Reload to see it." };
  await audit("review_cycle_members", review.cycle.id, by, { action: "client_review.skip_mark_waived", teamMemberId });
  return { ok: true };
}

/**
 * Releases one member's review (story 51): from now the member, their manager
 * of record and their coach read both parts, both averages and the HR summary,
 * and the skip-manager's notes stay with the review admins (./rules,
 * whatViewerSees). There is no command to undo a release.
 */
export async function releaseClientReview(cycleId: string, teamMemberId: string, by: Actor): Promise<Result> {
  const review = await reviewFor(cycleId, teamMemberId, by, "release");
  if (!review.ok) return review;
  const { data, error } = await companyOs
    .from("review_cycle_members")
    .update({ released_at: new Date().toISOString(), released_by: by.personId })
    .eq("cycle_id", review.cycle.id)
    .eq("team_member_id", teamMemberId)
    .is("released_at", null)
    .is("withdrawn_at", null)
    .select("team_member_id");
  if (error) return { ok: false, error: "The review could not be released." };
  if (!data?.length) return { ok: false, error: RELEASED_JUST_NOW };
  await audit("review_cycle_members", review.cycle.id, by, { action: "client_review.released", teamMemberId });
  return { ok: true };
}
