// The meetings table, as the entities around crm ask about it and write to it
// (A.63). crm owns meetings and their children (participants, action items);
// coaching, training, team, boards and campaigns file and read meetings of
// their own kinds. Each question here names what it answers and keeps its
// filters, so a caller never chooses the table's columns or adds a filter that
// carries crm's meaning. The client-facing reads are in client-meeting-notes.ts,
// the group coaching sessions in group-sessions.ts, the meetings other records
// own (a 1-1, a review, a training) in linked-meetings.ts.
import { companyOs } from "@/kernel/data/supabase";
import type { Json, TablesInsert } from "@/kernel/data/supabase/database.types";

export type MeetingInput = TablesInsert<{ schema: "company_os" }, "meetings">;
export type MeetingParticipantInput = TablesInsert<{ schema: "company_os" }, "meeting_participants">;
export type MeetingActionItemInput = TablesInsert<{ schema: "company_os" }, "meeting_action_items">;

/**
 * Writes one meeting and answers with its id. A unique index on (source,
 * external_id) refuses a second copy of the same recording, so a caller
 * reads `error.code` 23505 as "already stored".
 */
export async function recordMeeting(row: MeetingInput) {
  return companyOs.from("meetings").insert(row).select("id").single();
}

/** The company a live (not archived) meeting belongs to: the hub's check before it changes one. */
export async function liveMeetingCompany(meetingId: string) {
  return companyOs.from("meetings").select("company_id").eq("id", meetingId).is("archived_at", null).maybeSingle();
}

/** The most recent dated, live meetings, newest first: the sprint's "attach meeting" picker. */
export async function recentMeetings(limit: number) {
  return companyOs
    .from("meetings")
    .select("id, title, started_at")
    .is("archived_at", null)
    .not("started_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(limit);
}

/** Every meeting started on or after `since`, newest first, at most `limit`, with its summary. */
export async function meetingSummariesSince(since: string, limit: number) {
  return companyOs
    .from("meetings")
    .select("title, started_at, summary")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(limit);
}

/** Publishes a meeting's notes to the client team, or takes them back. */
export async function publishMeetingNotes(meetingId: string, published: boolean) {
  const now = new Date().toISOString();
  return companyOs.from("meetings").update({ published_at: published ? now : null, updated_at: now }).eq("id", meetingId);
}

/** Tags a meeting to an AI Program, or clears the tag (null: company-wide). The caller checks the program is the meeting's company's. */
export async function tagMeetingProgram(meetingId: string, programId: string | null) {
  return companyOs.from("meetings").update({ ai_program_id: programId, updated_at: new Date().toISOString() }).eq("id", meetingId);
}

/** Replaces a meeting's metadata. The caller merges what it keeps: PostgREST cannot patch one key of a jsonb column. */
export async function setMeetingMetadata(meetingId: string, metadata: { [key: string]: Json | undefined }) {
  return companyOs.from("meetings").update({ metadata }).eq("id", meetingId);
}

/**
 * Fills in a meeting's title, summary and metadata once a later pass has
 * them: the Zoom ingest's transcript pass over a row it wrote from Zoom's
 * summary alone.
 */
export async function completeMeetingRecord(
  meetingId: string,
  patch: { title: string; summary: string | null; recording_url?: string | null; metadata: { [key: string]: Json | undefined } },
) {
  return companyOs.from("meetings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", meetingId);
}

/** Adds the people who were in a meeting. */
export async function addMeetingParticipants(rows: MeetingParticipantInput[]) {
  return companyOs.from("meeting_participants").insert(rows);
}

/** Adds a meeting's action items. */
export async function addMeetingActionItems(rows: MeetingActionItemInput[]) {
  return companyOs.from("meeting_action_items").insert(rows);
}

/** A meeting's action items, in their order. */
export async function actionItemsOfMeeting(meetingId: string) {
  return companyOs
    .from("meeting_action_items")
    .select("title, detail, due_date, position")
    .eq("meeting_id", meetingId)
    .order("position", { ascending: true });
}

/** Removes a meeting's action items: the transcript pass's rollback when the row update after them failed. */
export async function removeMeetingActionItems(meetingId: string) {
  return companyOs.from("meeting_action_items").delete().eq("meeting_id", meetingId);
}

/**
 * Removes a meeting that was half written, children first. PostgREST has no
 * transaction, so a writer whose child insert failed unwinds the meeting with
 * this; otherwise its dedup would skip the half-written meeting forever. Best
 * effort: the writer is already reporting the failure that brought it here.
 */
export async function unwindMeeting(meetingId: string): Promise<void> {
  await companyOs.from("meeting_action_items").delete().eq("meeting_id", meetingId);
  await companyOs.from("meeting_participants").delete().eq("meeting_id", meetingId);
  await companyOs.from("meetings").delete().eq("id", meetingId);
}
