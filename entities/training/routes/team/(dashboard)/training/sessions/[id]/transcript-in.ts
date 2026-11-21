// A taught session's transcript, in and out (English Program PR 6). The
// meeting record is crm's (meetings, call_transcripts, meeting_associations),
// so every write and read goes through the questions and commands crm's door
// exports. Training requires nothing, so this lives beside the
// route rather than under lib/: a route body may import another entity's
// door, and the Lark pickup (PR 7, a cron, also outside the door graph) calls
// the same functions, so a transcript arriving by hand or by pickup lands the
// same way: one meeting (source training, type Training, keyed on an external
// id), one transcript on it, one association to the training, then the
// register read from who spoke, through the register's own module, which keeps
// every person's word (A.40).
import { mustRows } from "@/kernel/data/read";
import { linkMeetingToTraining, meetingOfTraining, meetingRecordingLinks, meetingsWithExternalId, recordMeeting, relinkMeetingRecording, saveMeetingTranscript, transcriptRowsOfMeeting } from "@/entities/crm";
import { transcriptHeard } from "@/entities/training/lib/attendance-word";
import { speakersIn } from "@/entities/training/lib/transcript-attendance";

export type TranscriptIn = {
  trainingId: string;
  organiserId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  transcript: string;
  // training:<id> for a manual upload; the Lark minute token for a pickup.
  externalId: string;
  recordingUrl?: string | null;
  minutesUrl?: string | null;
  minuteToken?: string | null;
};

export type SessionTranscript = { meetingId: string; transcript: string | null; recordingUrl: string | null; minutesUrl: string | null; updatedAt: string | null };

/** The meeting already associated to this training, if any. */
async function meetingOf(trainingId: string): Promise<string | null> {
  const rows = mustRows(await meetingOfTraining(trainingId), "[training] meeting association");
  return rows[0]?.meeting_id ?? null;
}

/** The session's transcript and links, for the page and the recap; null when none has arrived. */
export async function readSessionTranscript(trainingId: string): Promise<SessionTranscript | null> {
  const meetingId = await meetingOf(trainingId);
  if (!meetingId) return null;
  const meetings = mustRows(await meetingRecordingLinks(meetingId), "[training] meeting");
  const transcripts = mustRows(await transcriptRowsOfMeeting(meetingId), "[training] transcript");
  const m = meetings[0];
  if (!m) return null;
  return { meetingId, transcript: transcripts[0]?.transcript ?? null, recordingUrl: m.recording_url, minutesUrl: m.minutes_url, updatedAt: transcripts[0]?.updated_at ?? null };
}

/**
 * Whether a recording or a session is already filed: a meeting with this
 * external id, or (for a manual upload keyed on the training) an association
 * to the training. The pickup's idempotency key.
 */
export async function meetingExistsFor(externalId: string, trainingId?: string): Promise<boolean> {
  if (trainingId && (await meetingOf(trainingId))) return true;
  const rows = mustRows(await meetingsWithExternalId(externalId), "[training] meeting by external id");
  return rows.length > 0;
}

/**
 * Files the transcript: the meeting (created once per training; a replacement
 * reuses it), the transcript (one per meeting, replaced), the association
 * (once), then attendance. Returns the meeting id.
 */
export async function saveTranscriptIn(input: TranscriptIn, now: Date): Promise<{ ok: true; meetingId: string } | { ok: false; error: string }> {
  let meetingId = await meetingOf(input.trainingId);
  const links = { recordingUrl: input.recordingUrl ?? null, minutesUrl: input.minutesUrl ?? null };
  if (!meetingId) {
    const { data, error } = await recordMeeting({
      source: "training",
      meeting_type: "Training",
      title: input.title,
      external_id: input.externalId,
      owner_id: input.organiserId,
      started_at: input.startsAt,
      ended_at: input.endsAt,
      recording_url: links.recordingUrl,
      minutes_url: links.minutesUrl,
      metadata: { origin: "training", training_id: input.trainingId },
    });
    if (error || !data) return { ok: false, error: `Could not create the meeting: ${error?.message ?? "no row"}` };
    meetingId = data.id;
    const { error: assocErr } = await linkMeetingToTraining(meetingId, input.trainingId);
    if (assocErr) return { ok: false, error: `Could not link the meeting to the session: ${assocErr.message}` };
  } else if (input.recordingUrl || input.minutesUrl) {
    const { error } = await relinkMeetingRecording(meetingId, links, input.externalId);
    if (error) return { ok: false, error: `Could not update the meeting: ${error.message}` };
  }
  const { error: tErr } = await saveMeetingTranscript({ meeting_id: meetingId, title: input.title, started_at: input.startsAt, source: "training", call_type: "internal", transcript: input.transcript, minute_token: input.minuteToken ?? null, updated_at: now.toISOString() });
  if (tErr) return { ok: false, error: `Could not save the transcript: ${tErr.message}` };
  const applied = await transcriptHeard(input.trainingId, speakersIn(input.transcript), now);
  if (!applied.ok) return applied;
  return { ok: true, meetingId };
}
