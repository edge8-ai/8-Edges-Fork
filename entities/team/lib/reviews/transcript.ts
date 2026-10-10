import { companyOs } from "@/kernel/data/supabase";
import { selectCallTranscripts, selectMeetings, insertMeetings, upsertCallTranscripts } from "@/entities/crm";

// A performance review can have one call transcript attached (a review
// conversation, a manager's recorded 1-1, etc.). Like coaching 1-1s, the text
// lives in the central meetings table: a source='review' meeting linked back to
// the review via metadata.performance_review_id, with call_transcripts holding
// the text. This helper is the single place the review flow creates/links that
// meeting and reads/writes the transcript, so review code never has to know the
// call_transcripts shape.
//
// AUTHORIZATION IS THE CALLER'S JOB (the review server action gates on the
// reviewer via getReviewDetail before calling here). Everything runs on the
// service-role companyOs client.

const REVIEW_SOURCE = "review";

// Find the review's linked meeting id, or null if none exists yet.
export async function findReviewMeeting(reviewId: string): Promise<string | null> {
  const { data, error: meetingError } = await selectMeetings("id")
    .eq("source", REVIEW_SOURCE)
    .eq("metadata->>performance_review_id", reviewId)
    .maybeSingle();
  if (meetingError) console.error("[team/reviews] meetings", meetingError);
  return (data?.id as string | undefined) ?? null;
}

// Return the review's linked meeting id, creating a review-origin meeting
// (source='review', type '1-1') if there is none.
async function ensureReviewMeeting(reviewId: string, startedAt: string | null): Promise<string> {
  const existing = await findReviewMeeting(reviewId);
  if (existing) return existing;
  const { data, error } = await insertMeetings({
      source: REVIEW_SOURCE,
      meeting_type: "1-1",
      title: "Performance review call",
      started_at: startedAt,
      metadata: { origin: "review", performance_review_id: reviewId },
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create the review meeting.");
  return data.id as string;
}

export async function readReviewTranscript(reviewId: string): Promise<string | null> {
  const meetingId = await findReviewMeeting(reviewId);
  if (!meetingId) return null;
  const { data, error: transcriptError } = await selectCallTranscripts("transcript")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (transcriptError) console.error("[team/reviews] call_transcripts", transcriptError);
  return (data?.transcript as string | null) ?? null;
}

type SaveResult = { ok: true; meetingId: string } | { ok: false; error: string };

// Store (or replace) a review's transcript in call_transcripts, creating/linking
// its meeting first. One transcript per review.
export async function saveReviewTranscript(
  reviewId: string,
  transcript: string,
  startedAt: string | null,
): Promise<SaveResult> {
  let meetingId: string;
  try {
    meetingId = await ensureReviewMeeting(reviewId, startedAt);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not link the review to a meeting." };
  }

  const { error } = await upsertCallTranscripts(
    {
      meeting_id: meetingId,
      title: "Performance review call",
      started_at: startedAt,
      source: REVIEW_SOURCE,
      call_type: "internal",
      transcript,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "meeting_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, meetingId };
}
