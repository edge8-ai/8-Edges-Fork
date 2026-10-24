// Group coaching sessions, as the meetings table holds them (A.63). The Zoom
// ingest (entities/coaching/lib/zoom-ingest.ts) writes each recorded session as
// a meeting with source 'zoom' and keeps the original meeting type in
// metadata.source_meeting_type, because the meetings trigger normalises
// meeting_type itself. "A group coaching session" is therefore those two
// filters together, and they live here so the coaching pages, the timeline,
// the attendee backfill and the key-learnings sync cannot each spell them a
// little differently. The transcript and the attendee list ride in metadata.
import { companyOs } from "@/kernel/data/supabase";
import type { Json } from "@/kernel/data/supabase/database.types";

const SOURCE = "zoom";
const SOURCE_TYPE = "metadata->>source_meeting_type";
const COACHING = "coaching";

/** The metadata keys the coaching pages read. The row carries more; these are the ones with a shape. */
export type GroupSessionMetadata = { attendees?: string[]; speakers?: string[]; transcript?: string | null };

export type GroupSession = {
  id: string;
  title: string | null;
  started_at: string | null;
  duration_seconds: number | null;
  summary: string | null;
  recording_url: string | null;
  metadata: GroupSessionMetadata | null;
};

// The coaching list, the session page and the member's timeline read the same
// rows; the timeline needs fewer columns, so it gets this union.
const GROUP_SESSION = "id, title, started_at, duration_seconds, summary, recording_url, metadata";

/**
 * The live (not archived) group coaching sessions, newest first and undated
 * last. `limit` caps the walk for a reader that shows only recent history.
 */
export async function groupCoachingSessions(limit?: number) {
  let query = companyOs
    .from("meetings")
    .select(GROUP_SESSION)
    .eq("source", SOURCE)
    .eq(SOURCE_TYPE, COACHING)
    .is("archived_at", null)
    .order("started_at", { ascending: false, nullsFirst: false });
  if (limit !== undefined) query = query.limit(limit);
  const { data, error } = await query;
  // metadata is typed Json by the generated types; the keys above are what the
  // ingest writes, stated once here rather than by every reader.
  return { data: data as GroupSession[] | null, error };
}

/** One live group coaching session, or null when the id is not one. */
export async function groupCoachingSession(id: string) {
  const { data, error } = await companyOs
    .from("meetings")
    .select(GROUP_SESSION)
    .eq("id", id)
    .eq("source", SOURCE)
    .eq(SOURCE_TYPE, COACHING)
    .is("archived_at", null)
    .maybeSingle();
  return { data: data as GroupSession | null, error };
}

/** The meeting a Zoom recording was already stored as, if it was: the ingest's dedup. */
export async function zoomRecordingMeeting(recordingUuid: string) {
  return companyOs.from("meetings").select("id").eq("source", SOURCE).eq("external_id", recordingUuid).limit(1).maybeSingle();
}

export type SessionMissingAttendees = { id: string; external_id: string | null; metadata: Record<string, Json> | null };

/**
 * Group coaching sessions stored before Zoom's attendee list was kept
 * (metadata.attendees unset), newest first, at most `limit`. Archived ones
 * are included: the backfill completes the record whatever the page shows.
 */
export async function groupSessionsMissingAttendees(limit: number) {
  const { data, error } = await companyOs
    .from("meetings")
    .select("id, external_id, metadata")
    .eq("source", SOURCE)
    .eq(SOURCE_TYPE, COACHING)
    .is("metadata->attendees", null)
    .order("started_at", { ascending: false })
    .limit(limit);
  return { data: data as SessionMissingAttendees[] | null, error };
}

export type SessionAwaitingRecord = { id: string; title: string | null; started_at: string | null; metadata: Record<string, Json> | null };

/**
 * Group coaching sessions with a transcript, started on or after `since`, that
 * carry nothing yet under the metadata key `recordKey` (the key-learnings sync
 * names its own record), newest first, at most `limit`.
 */
export async function groupSessionsAwaitingRecord(recordKey: string, since: string, limit: number) {
  const { data, error } = await companyOs
    .from("meetings")
    .select("id, title, started_at, metadata")
    .eq("source", SOURCE)
    .eq(SOURCE_TYPE, COACHING)
    .not("metadata->>transcript", "is", null)
    .is(`metadata->${recordKey}`, null)
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(limit);
  return { data: data as SessionAwaitingRecord[] | null, error };
}
