// A client meeting's notes: the summary written from its transcript, and what
// the client's own people may read of it in /portal (A.63).
//
// PRIVACY HARD LINE: the portal questions never select the transcript
// (call_transcripts is admin-only) or any column beyond date, attendees, title,
// summary, publication and the AI Program tag. Only the summariser, which runs
// server-side for staff, reads the transcript, and it answers only for the two
// sources whose transcript the app itself stores.
import { companyOs } from "@/kernel/data/supabase";

// ── The portal's reads ──────────────────────────────────────────────────────
// Scoped by the caller's company ids; visibility between a client manager
// (every meeting) and a member (published ones) is the portal's rule and stays
// in entities/portal/lib/meetings.ts.

export type ClientMeetingNote = {
  id: string;
  // Never null here: both questions filter on company_id being one of the
  // caller's companies.
  company_id: string;
  started_at: string | null;
  title: string | null;
  attendees: string[] | null;
  summary: string | null;
  published_at: string | null;
  ai_program_id: string | null;
  ai_program: { name: string | null } | { name: string | null }[] | null;
};

const NOTE =
  "id, company_id, started_at, title, attendees, summary, published_at, ai_program_id, ai_program:ai_programs!ai_program_id(name)";

/** Whether any live meeting exists for these companies, as at most one id. */
export async function anyMeetingOfCompanies(companyIds: string[]) {
  return companyOs.from("meetings").select("id").in("company_id", companyIds).is("archived_at", null).limit(1);
}

/** Whether any live, published meeting exists for these companies, as at most one id. */
export async function anyPublishedMeetingOfCompanies(companyIds: string[]) {
  return companyOs
    .from("meetings")
    .select("id")
    .is("archived_at", null)
    .in("company_id", companyIds)
    .not("published_at", "is", null)
    .limit(1);
}

/** One live meeting's notes, if it belongs to one of these companies. */
export async function clientMeetingNote(meetingId: string, companyIds: string[]) {
  const { data, error } = await companyOs
    .from("meetings")
    .select(NOTE)
    .eq("id", meetingId)
    .in("company_id", companyIds)
    .is("archived_at", null)
    .maybeSingle();
  return { data: data as ClientMeetingNote | null, error };
}

/** Every live meeting's notes for these companies, newest first and undated last. */
export async function clientMeetingNotes(companyIds: string[]) {
  const { data, error } = await companyOs
    .from("meetings")
    .select(NOTE)
    .in("company_id", companyIds)
    .is("archived_at", null)
    .order("started_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  return { data: data as ClientMeetingNote[] | null, error };
}

// ── The summariser's reads and writes ───────────────────────────────────────

// The two sources whose transcript the app itself stores in call_transcripts:
// the notes upload, and a pasted Lark Minutes link (Z.5).
const SUMMARISED_SOURCES = ["notes", "lark"];

export type MeetingToSummarise = {
  id: string;
  title: string | null;
  attendees: string[] | null;
  started_at: string | null;
  call_transcripts: { transcript: string | null }[] | { transcript: string | null } | null;
};

/** The meeting and its transcript, when it is one the summariser writes for; null otherwise. */
export async function meetingToSummarise(meetingId: string) {
  const { data, error } = await companyOs
    .from("meetings")
    .select("id, title, attendees, started_at, call_transcripts(transcript)")
    .eq("id", meetingId)
    .in("source", SUMMARISED_SOURCES)
    .maybeSingle();
  return { data: data as MeetingToSummarise | null, error };
}

/** Records that the summary could not be written, and why (the first 500 characters). */
export async function markMeetingSummaryFailed(meetingId: string, message: string) {
  return companyOs
    .from("meetings")
    .update({ ai_status: "failed", ai_error: message.slice(0, 500), updated_at: new Date().toISOString() })
    .eq("id", meetingId);
}

export type MeetingSummary = {
  summary: string;
  model: string;
  // Only the blanks the caller decided to fill: a person's own value is never overwritten.
  title?: string;
  attendees?: string[];
  startedAt?: string;
};

/** Stores a written summary, ready, with whichever blank fields it filled. */
export async function recordMeetingSummary(meetingId: string, written: MeetingSummary) {
  return companyOs
    .from("meetings")
    .update({
      summary: written.summary,
      summary_encrypted: false,
      ai_model: written.model,
      ai_status: "ready",
      ai_error: null,
      updated_at: new Date().toISOString(),
      ...(written.title !== undefined ? { title: written.title } : {}),
      ...(written.attendees !== undefined ? { attendees: written.attendees } : {}),
      ...(written.startedAt !== undefined ? { started_at: written.startedAt } : {}),
    })
    .eq("id", meetingId);
}
