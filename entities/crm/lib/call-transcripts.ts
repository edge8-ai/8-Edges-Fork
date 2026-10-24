// A meeting's transcript, as the entities that file one ask for it (A.63).
// call_transcripts holds one row per meeting (the upsert below conflicts on
// meeting_id), so "the transcript of a meeting" is a single row. Coaching 1-1s,
// performance reviews and taught training sessions each keep their text here
// against a meeting of their own; the questions answer by meeting id so none of
// them has to know the table.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert } from "@/kernel/data/supabase/database.types";

export type MeetingTranscript = { transcript: string; updated_at: string };

const TRANSCRIPT = "transcript, updated_at";

/** The transcript filed against a meeting, or null when none has been. */
export async function transcriptOfMeeting(meetingId: string) {
  return companyOs.from("call_transcripts").select(TRANSCRIPT).eq("meeting_id", meetingId).maybeSingle();
}

/**
 * The same question as a list of at most one row, for the training session
 * page, which reads every part of a session as rows (mustRows) and has asked
 * this way since English Program PR 6.
 */
export async function transcriptRowsOfMeeting(meetingId: string) {
  return companyOs.from("call_transcripts").select(TRANSCRIPT).eq("meeting_id", meetingId).limit(1);
}

export type MeetingTranscriptInput = TablesInsert<{ schema: "company_os" }, "call_transcripts"> & { meeting_id: string };

/** Files a meeting's transcript, replacing the one it had: one transcript per meeting. */
export async function saveMeetingTranscript(row: MeetingTranscriptInput) {
  return companyOs.from("call_transcripts").upsert(row, { onConflict: "meeting_id" });
}
