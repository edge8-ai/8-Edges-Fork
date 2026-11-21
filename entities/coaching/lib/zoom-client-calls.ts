// Every Zoom recording on the host's account that is not a group coaching
// session: discovery calls, program reviews, partner calls. Until 9 Nov 2026
// the ingest dropped them on the topic filter, so a sales call held on Zoom
// never reached company_os.meetings while the same call held on Lark did.
//
// A call is written once, when Zoom has processed its recording and the
// transcript exists, in the shape the Lark Minutes route leaves behind: a
// meetings row (source 'zoom', the recording uuid as external_id) with Zoom's
// own summary, a participant row per attendee, and the transcript in
// call_transcripts, which is what Sales Intelligence and the meeting-type
// routine read. meeting_type is left null for that routine to fill: a
// transcript tagged 'sales' types the meeting Sales with no model call, which
// is what Meetings booked counts. No Lark card goes out; the coaching group is
// not the audience for a client call.
import {
  addMeetingParticipants,
  recordMeeting,
  saveMeetingTranscript,
  unwindMeeting,
  zoomRecordingMeeting,
} from "@/entities/crm";
import type { Json } from "@/kernel/data/supabase/database.types";
import {
  downloadTranscript,
  getMeetingSummary,
  listAttendees,
  speakersFromText,
  vttToText,
  zoomSummaryMarkdown,
  type ZoomMeetingSummary,
  type ZoomRecording,
} from "./zoom";
import { participantRows } from "./zoom-ingest-write";

export type ClientCallsResult = {
  ingested: { id: string; title: string; callType: CallType }[];
  alreadyIngested: number;
  /** Recordings whose transcript Zoom is still processing, or never will (transcription was off). */
  awaitingTranscript: number;
  /** Recordings too short to be a call: a test, or a meeting opened and closed again. */
  tooShort: number;
};

export function emptyClientCalls(): ClientCallsResult {
  return { ingested: [], alreadyIngested: 0, awaitingTranscript: 0, tooShort: 0 };
}

type CallType = "sales" | "client" | "internal" | "other";

/**
 * The call_transcripts tag from the meeting's title: the same rules the Lark
 * Minutes sync applies (scripts/calls/sync-lark-minutes.mjs), so a call is
 * tagged alike whichever tool recorded it. 'sales' is the one that matters:
 * the meeting-type routine reads it as Sales without asking a model.
 */
export function callTypeFromTitle(title: string): CallType {
  if (/discovery/i.test(title)) return "sales";
  if (/1-1|1:1|sprint|leadership|standup|all hands|partner meeting/i.test(title)) return "internal";
  if (/sync|roadmap|onboarding|<>/i.test(title)) return "client";
  return "other";
}

// The Lark sync skips a transcript under 500 characters as an aborted
// recording; the same floor keeps a two-minute test call out of the pipeline.
const MIN_TRANSCRIPT_CHARS = 500;

/** Writes one client call, or counts why it was not written. Every failure is a line in `errors`. */
export async function ingestClientCall(token: string, rec: ZoomRecording, result: ClientCallsResult, errors: string[]): Promise<void> {
  const tag = `${rec.start_time ?? "?"} "${rec.topic ?? ""}" (${rec.uuid})`;
  const { data: stored, error: dedupError } = await zoomRecordingMeeting(rec.uuid);
  if (dedupError) {
    errors.push(`dedup query failed for ${tag}: ${dedupError.message}`);
    return;
  }
  if (stored) {
    result.alreadyIngested += 1;
    return;
  }

  const file = await downloadTranscript(token, rec);
  const transcript = file ? vttToText(file.vtt) : "";
  if (!file || !transcript) {
    result.awaitingTranscript += 1;
    return;
  }
  if (transcript.length < MIN_TRANSCRIPT_CHARS) {
    result.tooShort += 1;
    return;
  }

  let attendees: string[] | null = null;
  try {
    attendees = await listAttendees(token, rec.uuid);
  } catch (e) {
    errors.push(`attendee list failed for ${tag}, the call names its speakers only: ${e instanceof Error ? e.message : String(e)}`);
  }
  // Zoom's summary is a bonus here, not a gate: the transcript is the record.
  let zoom: ZoomMeetingSummary | null = null;
  try {
    zoom = await getMeetingSummary(token, rec.uuid);
  } catch (e) {
    errors.push(`Zoom summary read failed for ${tag}, the call is stored without it: ${e instanceof Error ? e.message : String(e)}`);
  }

  const title = rec.topic?.trim() || zoom?.title || "Zoom call";
  const callType = callTypeFromTitle(title);
  const speakers = speakersFromText(transcript);
  const people = attendees?.length ? attendees : speakers;
  const durationSec = rec.duration ? rec.duration * 60 : null;
  const startedAt = rec.start_time ?? null;
  const endedAt = startedAt && durationSec ? new Date(Date.parse(startedAt) + durationSec * 1000).toISOString() : null;
  const metadata: Record<string, Json> = {
    source: "zoom",
    zoom_meeting_id: String(rec.id),
    zoom_uuid: rec.uuid,
    meeting_date: startedAt ? startedAt.slice(0, 10) : null,
    speakers,
    ...(attendees?.length ? { attendees } : {}),
    ...(zoom
      ? { zoom_summary: { title: zoom.title, overview: zoom.overview, details: zoom.details, next_steps: zoom.nextSteps, created_at: zoom.createdAt } }
      : {}),
    logged_by: "/api/cron/zoom-transcripts/",
  };

  const { data: row, error: insertError } = await recordMeeting({
    source: "zoom",
    external_id: rec.uuid,
    title,
    // Null on purpose: the meeting-type routine types it from the transcript's tag.
    meeting_type: null,
    summary: zoom ? zoomSummaryMarkdown(zoom) : null,
    summary_encrypted: false,
    recording_url: rec.share_url ?? null,
    owner_id: null,
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: durationSec,
    metadata,
  });
  // A run beside this one stored the recording first (the unique index on source, external_id).
  if (insertError?.code === "23505") {
    result.alreadyIngested += 1;
    return;
  }
  if (insertError || !row) {
    errors.push(`write failed for ${tag}: meetings insert failed: ${insertError?.message ?? "no row returned"}`);
    return;
  }
  try {
    if (people.length > 0) {
      const { error } = await addMeetingParticipants(participantRows(row.id, people));
      if (error) throw new Error(`participants insert failed: ${error.message}`);
    }
    const { error } = await saveMeetingTranscript({
      meeting_id: row.id,
      title,
      started_at: startedAt,
      duration_seconds: durationSec,
      source: "zoom",
      call_type: callType,
      transcript,
    });
    if (error) throw new Error(`transcript insert failed: ${error.message}`);
  } catch (e) {
    // No transaction over PostgREST: take the meeting back out so the dedup does not skip a half-written call forever.
    await unwindMeeting(row.id);
    errors.push(`write failed for ${tag}: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  result.ingested.push({ id: row.id, title, callType });
}
