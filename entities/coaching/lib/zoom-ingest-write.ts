// The writes of the Zoom group-coaching ingest: one session into
// company_os.meetings and its children, at one of two stages.
//
// Zoom produces two things after a session, an hour apart. Its AI Companion
// summary exists within a minute of the call ending; the cloud recording's
// transcript (the VTT) only after the whole recording is processed, which on
// 29 Oct 2026 was fifty minutes later. The ingest used to wait for the VTT,
// so the card reached the coaching chat an hour after everyone had left. Now:
//
//   summary stage    Zoom's summary is in and the transcript is not: the row
//                    is written with Zoom's summary, its attendees, and
//                    metadata.ingest_stage "summary"; the card goes out.
//   transcript stage The VTT is in: the row gets the transcript, our own
//                    actionable summary and its action items, and the stage
//                    becomes "transcript". A row that skipped the summary
//                    stage (a transcript that was there on first sight) is
//                    written complete in one go, as before. A row announced
//                    at the summary stage gets a one-line notice, not a
//                    second card.
//
// Failure isolation, in order of what matters: a transcript ALWAYS lands when
// Zoom has one, a failed summary marks the row pending rather than dropping
// it, and a rejected Lark post is reported in the run result rather than
// undoing the write. PostgREST has no transaction, so a child insert that
// fails unwinds a new meeting row too; otherwise the dedup would skip a
// half-written session forever. The transcript pass over an existing row
// claims it first (claimGroupSessionStage), because two runs can meet the
// same transcript, and puts the stage back on failure so the next run retries.
import {
  addMeetingActionItems,
  addMeetingParticipants,
  claimGroupSessionStage,
  completeMeetingRecord,
  groupSessionForTranscript,
  recordMeeting,
  removeMeetingActionItems,
  setMeetingMetadata,
  unwindMeeting,
} from "@/entities/crm";
import { optionalEnv } from "@/kernel/config/env";
import type { Json } from "@/kernel/data/supabase/database.types";
import { sendLarkMessage } from "@/kernel/messaging/lark";
import { summarizeGroupSession, type GroupSummary } from "./group-summary";
import { buildSessionCard, fullNotesText } from "./zoom-session-card";
import { speakersFromText, zoomSummaryMarkdown, type ZoomMeetingSummary, type ZoomRecording } from "./zoom";

// A speaker whose display name contains ZOOM_HOST_NAME (case-insensitive)
// becomes the meeting's host row; every other speaker is an attendee. Unset,
// everyone is an attendee.
function hostMatcher(): RegExp | null {
  const name = optionalEnv("ZOOM_HOST_NAME");
  return name ? new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;
}

export type IngestedSession = { id: string; title: string; stage: "summary" | "transcript"; summarized: boolean; notified: boolean };

/** The ingest's view of one recording, for the writers: the counters they add to and the lines they report. */
export type IngestSink = {
  ingested: IngestedSession[];
  enriched: { id: string; title: string; summarized: boolean; notified: boolean }[];
  alreadyIngested: number;
  errors: string[];
};

function timesOf(rec: ZoomRecording) {
  const durationSec = rec.duration ? rec.duration * 60 : null;
  const startedAt = rec.start_time ?? null;
  const endedAt =
    startedAt && durationSec ? new Date(new Date(startedAt).getTime() + durationSec * 1000).toISOString() : null;
  return { durationSec, startedAt, endedAt };
}

/** Participant rows for the people of a session; the host's own row when ZOOM_HOST_NAME names them. */
export function participantRows(meetingId: string, people: string[]) {
  const host = hostMatcher();
  return people.map((name) => ({
    meeting_id: meetingId,
    person_id: null,
    external_email: null,
    display_name: name,
    role: host?.test(name) ? "host" : "attendee",
    attended: true,
  }));
}

function actionItemRows(meetingId: string, summary: GroupSummary) {
  return summary.action_items.map((it, i) => ({
    meeting_id: meetingId,
    title: it.title,
    detail: actionDetail(it.detail, it.owner),
    assignee_id: null,
    due_date: dueDateOrNull(it.due_date),
    status: "open",
    position: i,
  }));
}

/** The row's fixed metadata: what both stages write before their own keys. */
function baseMetadata(rec: ZoomRecording, startedAt: string | null, attendees: string[] | null): Record<string, Json> {
  return {
    source: "zoom",
    zoom_meeting_id: String(rec.id),
    zoom_uuid: rec.uuid,
    meeting_date: startedAt ? startedAt.slice(0, 10) : null,
    ...(attendees?.length ? { attendees } : {}),
  };
}

/**
 * Writes a new session row with its people and, when there is one, its
 * summary's action items. Null when a run beside this one stored the
 * recording first (Y.41): the unique index on (source, external_id) refuses
 * the second insert, and the dedup read before it was not the same step.
 */
async function insertSession(
  rec: ZoomRecording,
  title: string,
  summary: string | null,
  metadata: Record<string, Json>,
  people: string[],
  items: GroupSummary | null,
): Promise<string | null> {
  const { durationSec, startedAt, endedAt } = timesOf(rec);
  const { data: row, error: insertError } = await recordMeeting({
    source: "zoom",
    external_id: rec.uuid,
    title,
    meeting_type: "coaching",
    summary,
    summary_encrypted: false,
    recording_url: rec.share_url ?? null,
    // No owner: resolving the host to a people row by name is the intake
    // hazard the company-os rules warn about, and nothing reads owner_id here.
    owner_id: null,
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: durationSec,
    metadata,
  });
  if (insertError?.code === "23505") return null;
  if (insertError || !row) throw new Error(`meetings insert failed: ${insertError?.message ?? "no row returned"}`);
  const meetingId = row.id;
  try {
    if (people.length > 0) {
      const { error } = await addMeetingParticipants(participantRows(meetingId, people));
      if (error) throw new Error(`participants insert failed: ${error.message}`);
    }
    if (items && items.action_items.length > 0) {
      const { error } = await addMeetingActionItems(actionItemRows(meetingId, items));
      if (error) throw new Error(`action items insert failed: ${error.message}`);
    }
  } catch (e) {
    await unwindMeeting(meetingId);
    throw e;
  }
  return meetingId;
}

/** The summary stage: Zoom's own summary, written and announced while the transcript is still processing. */
export async function writeSummaryStage(
  rec: ZoomRecording,
  tag: string,
  zoom: ZoomMeetingSummary,
  attendees: string[] | null,
  siteOrigin: string,
  sink: IngestSink,
): Promise<void> {
  const { startedAt } = timesOf(rec);
  const markdown = zoomSummaryMarkdown(zoom);
  const title = zoom.title || rec.topic || "Coaching session";
  const metadata: Record<string, Json> = {
    ...baseMetadata(rec, startedAt, attendees),
    speakers: [],
    ingest_stage: "summary",
    zoom_summary: { title: zoom.title, overview: zoom.overview, details: zoom.details, next_steps: zoom.nextSteps, created_at: zoom.createdAt },
    ai_status: "pending",
  };
  let meetingId: string;
  try {
    const written = await insertSession(rec, title, markdown, metadata, attendees ?? [], null);
    if (written === null) {
      sink.alreadyIngested += 1;
      return;
    }
    meetingId = written;
  } catch (e) {
    sink.errors.push(`write failed for ${tag}: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  const notified = await sendLarkMessage({
    card: buildSessionCard({
      title,
      dateLabel: startedAt ? startedAt.slice(0, 10) : null,
      speakers: attendees ?? [],
      summaryMarkdown: markdown,
      actionItemCount: zoom.nextSteps.length,
      url: siteOrigin ? `${siteOrigin}/team/coaching-sessions/${meetingId}` : null,
      stage: "summary",
    }),
  });
  if (!notified) sink.errors.push(`Lark post rejected or unconfigured for ${tag}; the row ${meetingId} is written.`);
  sink.ingested.push({ id: meetingId, title, stage: "summary", summarized: false, notified });
}

/** The transcript on a row: the keys the transcript stage adds, over what the row already carries. */
function transcriptMetadata(
  base: Record<string, Json>,
  transcript: string,
  speakers: string[],
  downloadUrl: string,
  model: string | null,
): Record<string, Json> {
  const { ai_status: _pending, ingest_claimed_at: _claim, ...kept } = base;
  return {
    ...kept,
    source_file: downloadUrl,
    speakers,
    transcript,
    ingest_stage: "transcript",
    ...(model ? { ai_model: model } : { ai_status: "pending" }),
  };
}

/** The whole session in one go: a transcript that was there on first sight (the path before the stages). */
export async function writeCompleteSession(
  rec: ZoomRecording,
  tag: string,
  transcript: string,
  downloadUrl: string,
  attendees: string[] | null,
  siteOrigin: string,
  sink: IngestSink,
): Promise<void> {
  const { startedAt } = timesOf(rec);
  const summarized = await summarizeGroupSession(transcript);
  if (!summarized.ok) sink.errors.push(`summary failed for ${tag}, transcript stored without it: ${summarized.error}`);
  const summary = summarized.ok ? summarized.summary : null;
  const speakers = speakersFromText(transcript);
  const people = attendees?.length ? attendees : speakers;
  const title = summary?.title.trim() || rec.topic || "Coaching session";
  const metadata = transcriptMetadata(baseMetadata(rec, startedAt, attendees), transcript, speakers, downloadUrl, summarized.ok ? summarized.model : null);
  let meetingId: string;
  try {
    const written = await insertSession(rec, title, summary?.summary_markdown ?? null, metadata, people, summary);
    if (written === null) {
      sink.alreadyIngested += 1;
      return;
    }
    meetingId = written;
  } catch (e) {
    sink.errors.push(`write failed for ${tag}: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  const notified = await sendLarkMessage({
    card: buildSessionCard({
      title,
      dateLabel: startedAt ? startedAt.slice(0, 10) : null,
      speakers: people,
      summaryMarkdown: summary?.summary_markdown ?? null,
      actionItemCount: summary?.action_items.length ?? 0,
      url: siteOrigin ? `${siteOrigin}/team/coaching-sessions/${meetingId}` : null,
    }),
  });
  if (!notified) sink.errors.push(`Lark post rejected or unconfigured for ${tag}; the row ${meetingId} is written.`);
  sink.ingested.push({ id: meetingId, title, stage: "transcript", summarized: summarized.ok, notified });
}

// A claim older than this is a run Vercel killed mid-pass (the function's
// ceiling is 300 s), and the next run takes the row over.
export const STALE_CLAIM_MS = 15 * 60 * 1000;

/** The transcript stage over a row the summary stage wrote. */
export async function writeTranscriptStage(
  rec: ZoomRecording,
  tag: string,
  meetingId: string,
  fromStage: string,
  transcript: string,
  downloadUrl: string,
  siteOrigin: string,
  sink: IngestSink,
): Promise<void> {
  const { data: row, error: readError } = await groupSessionForTranscript(meetingId);
  if (readError) {
    sink.errors.push(`transcript pass read failed for ${tag}: ${readError.message}`);
    return;
  }
  if (!row) {
    sink.alreadyIngested += 1;
    return;
  }
  const base: Record<string, Json> = { ...(row.metadata ?? {}) };
  const { claimed, error: claimError } = await claimGroupSessionStage(meetingId, fromStage, {
    ...base,
    ingest_stage: "enriching",
    ingest_claimed_at: new Date().toISOString(),
  });
  if (claimError) {
    sink.errors.push(`transcript pass claim failed for ${tag}: ${claimError.message}`);
    return;
  }
  if (!claimed) {
    sink.alreadyIngested += 1;
    return;
  }
  try {
    const summarized = await summarizeGroupSession(transcript);
    if (!summarized.ok) sink.errors.push(`summary failed for ${tag}, transcript stored with Zoom's summary kept: ${summarized.error}`);
    const summary = summarized.ok ? summarized.summary : null;
    const speakers = speakersFromText(transcript);
    // The summary stage wrote Zoom's attendee list as the participants. Only a
    // row that got none (the attendee read failed, and the backfill has not
    // reached it since) takes the speakers now; anyone silent is the backfill's.
    if (!Array.isArray(base.attendees) && speakers.length > 0) {
      const { error } = await addMeetingParticipants(participantRows(meetingId, speakers));
      if (error) sink.errors.push(`participants insert failed for ${tag}: ${error.message}`);
    }
    if (summary && summary.action_items.length > 0) {
      const { error } = await addMeetingActionItems(actionItemRows(meetingId, summary));
      if (error) throw new Error(`action items insert failed: ${error.message}`);
    }
    const title = summary?.title.trim() || row.title || rec.topic || "Coaching session";
    const { error: updateError } = await completeMeetingRecord(meetingId, {
      title,
      // Without our summary the row keeps Zoom's, marked pending, as before.
      summary: summary?.summary_markdown ?? row.summary,
      // A row the webhook wrote before Zoom listed the recording has no share link yet.
      ...(rec.share_url ? { recording_url: rec.share_url } : {}),
      metadata: transcriptMetadata(base, transcript, speakers, downloadUrl, summarized.ok ? summarized.model : null),
    });
    if (updateError) {
      await removeMeetingActionItems(meetingId);
      throw new Error(`meeting update failed: ${updateError.message}`);
    }
    const notified = summary
      ? await sendLarkMessage(
          fullNotesText({
            title,
            actionItemCount: summary.action_items.length,
            url: siteOrigin ? `${siteOrigin}/team/coaching-sessions/${meetingId}` : null,
          }),
        )
      : false;
    sink.enriched.push({ id: meetingId, title, summarized: summarized.ok, notified });
  } catch (e) {
    sink.errors.push(`transcript pass failed for ${tag}: ${e instanceof Error ? e.message : String(e)}`);
    // Back to the summary stage, so the next run retries; best effort, as the
    // failure is already reported and a stale claim is taken over anyway.
    const { error } = await setMeetingMetadata(meetingId, { ...base, ingest_stage: "summary" });
    if (error) sink.errors.push(`transcript pass could not release ${tag}: ${error.message}`);
  }
}

/**
 * The model is told to omit due_date when no deadline was stated, but it emits "" often
 * enough that the first live group session failed to write: Postgres rejects "" for a date
 * column, and the whole meeting rolled back every hour. Only a real YYYY-MM-DD goes through.
 */
export function dueDateOrNull(value: string | undefined): string | null {
  const v = value?.trim() ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** The action item's context line, with its owner kept as text until speakers map to people. */
export function actionDetail(detail: string, owner: string): string | null {
  const parts = [detail.trim(), owner && owner !== "Unassigned" ? `Owner: ${owner}` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(". ") : null;
}
