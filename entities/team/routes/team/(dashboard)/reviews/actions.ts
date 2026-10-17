"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runInBackground } from "@/kernel/audit/background";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { finalizeReview, getReviewDetail } from "@/entities/team/lib/reviews";
import { extractTranscript, MEETING_MAX_BYTES } from "@/entities/assistant";
import { saveReviewTranscript } from "@/entities/team/lib/reviews/transcript";
import {
  summarizeReviewCall,
  markReviewSummaryPending,
  setReviewSummaryIncluded,
} from "@/entities/team/lib/review-summary";

// Finalize a submitted manager review. Authorization (the actor must be the
// row's reviewer-of-record) lives in finalizeReview; the id from the form is
// re-checked there, never trusted.
export async function finalizeReviewAction(formData: FormData): Promise<void> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const id = String(formData.get("id") ?? "");
  const result = await finalizeReview(actor, id);
  revalidatePath("/team/reviews");
  revalidatePath(`/team/reviews/${id}`);
  if (!result.ok) redirect(`/team/reviews/${id}?error=${encodeURIComponent(result.error)}`);
}

// Attach a call transcript to a review and kick off AI summarization. Only the
// review's reviewer-of-record may add one, and only before it is finalized;
// getReviewDetail re-authorizes the id from the form. The transcript and its
// draft summary attach to the manager row (the side the reviewer writes and
// finalizes); nothing is folded into the overall review here (that is on
// explicit approval, PR 2).
export async function addReviewTranscriptAction(formData: FormData): Promise<void> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const id = String(formData.get("id") ?? "");
  const back = (error: string) => redirect(`/team/reviews/${id}?error=${encodeURIComponent(error)}`);

  const detail = await getReviewDetail(actor, id);
  if (!detail || !detail.isReviewer || !detail.manager) return back("You cannot add a transcript to this review.");
  if (detail.manager.status === "finalized") return back("This review is finalized; transcripts are locked.");
  const writeId = detail.manager.id;

  const pasted = String(formData.get("transcript") ?? "").trim();
  const file = formData.get("file");
  let transcript = pasted;

  if (file instanceof File && file.size > 0) {
    if (file.size > MEETING_MAX_BYTES) return back("File is too large (max 10 MB).");
    const extracted = await extractTranscript(file);
    if (!extracted.ok) return back(extracted.error);
    transcript = extracted.text;
  }
  if (!transcript) return back("Paste a transcript or upload a file.");

  const saved = await saveReviewTranscript(writeId, transcript, null);
  if (!saved.ok) return back(saved.error);

  await markReviewSummaryPending(writeId, saved.meetingId);
  runInBackground("/background/review-summary/", `review ${writeId}`, () => summarizeReviewCall(writeId));

  revalidatePath("/team/reviews");
  revalidatePath(`/team/reviews/${id}`);
}

// Fold the call summary into the overall review as a labeled "From call"
// section, or retract it. Same reviewer gate as adding a transcript. The
// section is stored (edited text and all) on the manager row's
// metadata.transcript_summary and rendered non-destructively, so the manager's
// written narrative is never overwritten.
export async function setReviewSummaryIncludedAction(formData: FormData): Promise<void> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const id = String(formData.get("id") ?? "");
  const include = String(formData.get("include") ?? "") === "1";
  const finalMarkdown = String(formData.get("final_markdown") ?? "");
  const back = (error: string) => redirect(`/team/reviews/${id}?error=${encodeURIComponent(error)}`);

  const detail = await getReviewDetail(actor, id);
  if (!detail || !detail.isReviewer || !detail.manager) return back("You cannot edit this review.");
  if (detail.manager.status === "finalized") return back("This review is finalized and locked.");

  await setReviewSummaryIncluded(detail.manager.id, include, include ? finalMarkdown : null);

  revalidatePath("/team/reviews");
  revalidatePath(`/team/reviews/${id}`);
}
