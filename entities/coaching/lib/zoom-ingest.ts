// Zoom group-coaching ingest: the hourly cron's body, the Thursday burst's, and
// the Zoom webhook's. Lists the coaching host's recent cloud recordings, skips
// the ones already complete in company_os.meetings, and writes each new one in
// two stages (./zoom-ingest-write): Zoom's own summary the minute it exists,
// our own actionable summary and the transcript once Zoom has processed the
// recording. The card goes to the coaching Lark group at the first stage.
//
// This replaces the operator-run scripts/crm/zoom-ingest.mjs, which needed a
// laptop to be open after every Thursday session. The rows it writes are the
// ones /team/coaching-sessions reads (./sessions.ts): source 'zoom', full
// transcript inline in metadata.transcript so a summary can be regenerated
// whenever the prompt improves, and metadata.source_meeting_type 'coaching'
// (the meetings trigger normalises meeting_type itself and preserves the
// original there).
import { groupSessionsMissingAttendees, setMeetingMetadata, addMeetingParticipants, zoomRecordingMeeting } from "@/entities/crm";
import { optionalEnv } from "@/kernel/config/env";
import { addDays } from "@/kernel/config/dates";
import { emptyLearningsSync, syncKeyLearnings, type LearningsSyncResult } from "./key-learnings-sync";
import {
  downloadTranscript,
  getMeetingSummary,
  getZoomToken,
  listAttendees,
  listRecordings,
  vttToText,
  zoomCreds,
  type ZoomRecording,
} from "./zoom";
import {
  STALE_CLAIM_MS,
  participantRows,
  writeCompleteSession,
  writeSummaryStage,
  writeTranscriptStage,
  type IngestedSession,
} from "./zoom-ingest-write";

// How far back a run looks. Two weeks covers a Thursday whose transcript Zoom
// finished late plus one skipped week, without ever re-reading a whole term;
// anything older is the operator script's territory.
const LOOKBACK_DAYS = 14;

// Sessions written per run, at either stage. One session is at most one
// transcript download and one Sonnet call, well under a minute; three keeps a
// backlog moving and the run far inside the route's 300s ceiling.
const MAX_PER_RUN = 3;

/**
 * A meeting the Zoom webhook says has just finished (its summary is written,
 * or its recording is processed). The ingest treats it as a recording whether
 * or not Zoom lists it yet, so the summary stage does not wait for the
 * recording list to catch up.
 */
export type ZoomSessionHint = {
  uuid: string;
  id: string | number;
  topic: string;
  hostEmail: string | null;
  startTime: string | null;
  endTime: string | null;
};

export type ZoomIngestResult = {
  enabled: boolean;
  reason?: string;
  host?: string;
  scanned: number;
  ingested: IngestedSession[];
  /** Sessions announced from Zoom's summary that got their transcript, our summary and action items this run. */
  enriched: { id: string; title: string; summarized: boolean; notified: boolean }[];
  alreadyIngested: number;
  /** Recordings with neither a transcript nor a Zoom summary yet: the call is still on, or just ended. */
  awaitingSummary: number;
  /** Rows at the summary stage whose transcript Zoom is still processing. */
  awaitingTranscript: number;
  attendeesBackfilled: number;
  // The key-learnings pass (Y.93): which sessions got their learnings on the
  // learning platform this run, which were kept as a person's, which have no
  // platform session yet.
  learnings: LearningsSyncResult;
  errors: string[];
};

/** The configuration the ingest needs, or the reason it is off. */
function config(): { host: string; topic: RegExp } | { reason: string } {
  if (!zoomCreds()) return { reason: "ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET are not all set." };
  const host = optionalEnv("ZOOM_HOST_EMAIL");
  if (!host) return { reason: "ZOOM_HOST_EMAIL is not set." };
  return { host, topic: new RegExp(optionalEnv("ZOOM_COACHING_TOPIC") ?? "coaching", "i") };
}

/** A webhook's meeting as a recording entry, when it is the coaching host's and Zoom does not list it yet. */
function recordingFromHint(hint: ZoomSessionHint, cfg: { host: string; topic: RegExp }, listed: ZoomRecording[]): ZoomRecording | null {
  if (hint.hostEmail && hint.hostEmail.toLowerCase() !== cfg.host.toLowerCase()) return null;
  if (!cfg.topic.test(hint.topic)) return null;
  if (listed.some((r) => r.uuid === hint.uuid)) return null;
  const start = hint.startTime ? Date.parse(hint.startTime) : NaN;
  const end = hint.endTime ? Date.parse(hint.endTime) : NaN;
  const duration = Number.isFinite(start) && Number.isFinite(end) && end > start ? Math.round((end - start) / 60000) : undefined;
  return { uuid: hint.uuid, id: hint.id, topic: hint.topic, start_time: hint.startTime ?? undefined, duration, recording_files: [] };
}

export async function ingestZoomCoachingSessions(todayISO: string, siteOrigin: string, hint?: ZoomSessionHint): Promise<ZoomIngestResult> {
  const result: ZoomIngestResult = {
    enabled: false,
    scanned: 0,
    ingested: [],
    enriched: [],
    alreadyIngested: 0,
    awaitingSummary: 0,
    awaitingTranscript: 0,
    attendeesBackfilled: 0,
    learnings: emptyLearningsSync(),
    errors: [],
  };
  const cfg = config();
  if ("reason" in cfg) return { ...result, reason: cfg.reason };
  result.enabled = true;
  result.host = cfg.host;

  const creds = zoomCreds();
  if (!creds) return { ...result, reason: "Zoom credentials vanished between checks." };
  try {
    const token = await getZoomToken(creds);
    const recordings = (await listRecordings(token, cfg.host, addDays(todayISO, -LOOKBACK_DAYS))).filter((r) => cfg.topic.test(r.topic ?? ""));
    const hinted = hint ? recordingFromHint(hint, cfg, recordings) : null;
    if (hinted) recordings.push(hinted);
    recordings.sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
    result.scanned = recordings.length;
    for (const rec of recordings) {
      if (result.ingested.length + result.enriched.length >= MAX_PER_RUN) break;
      await ingestOne(token, rec, siteOrigin, result);
    }
    await backfillAttendees(token, result);
    result.learnings = await syncKeyLearnings(todayISO, result.errors);
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
  }
  return result;
}

/** True for a claim a run took and never released: older than the function could have lived. */
function staleClaim(claimedAt: string | null): boolean {
  const at = claimedAt ? Date.parse(claimedAt) : NaN;
  return !Number.isFinite(at) || Date.now() - at > STALE_CLAIM_MS;
}

async function ingestOne(token: string, rec: ZoomRecording, siteOrigin: string, result: ZoomIngestResult): Promise<void> {
  const tag = `${rec.start_time ?? "?"} "${rec.topic ?? ""}" (${rec.uuid})`;

  const { data: stored, error: dedupError } = await zoomRecordingMeeting(rec.uuid);
  if (dedupError) {
    result.errors.push(`dedup query failed for ${tag}: ${dedupError.message}`);
    return;
  }
  // A stored row is complete unless it is waiting at the summary stage, or a
  // run claimed its transcript pass and died with it.
  const waiting = stored && (stored.stage === "summary" || (stored.stage === "enriching" && staleClaim(stored.claimedAt)));
  if (stored && !waiting) {
    result.alreadyIngested += 1;
    return;
  }

  const file = await downloadTranscript(token, rec);
  const transcript = file ? vttToText(file.vtt) : "";
  if (!file || !transcript) {
    if (stored) {
      result.awaitingTranscript += 1;
      return;
    }
    await summaryStage(token, rec, tag, siteOrigin, result);
    return;
  }
  if (stored) {
    await writeTranscriptStage(rec, tag, stored.id, stored.stage ?? "summary", transcript, file.downloadUrl, siteOrigin, result);
    return;
  }
  await writeCompleteSession(rec, tag, transcript, file.downloadUrl, await attendeesOf(token, rec, tag, result), siteOrigin, result);
}

/** Zoom's summary, if it exists yet, written and announced as the session's first stage. */
async function summaryStage(token: string, rec: ZoomRecording, tag: string, siteOrigin: string, result: ZoomIngestResult): Promise<void> {
  let summary;
  try {
    summary = await getMeetingSummary(token, rec.uuid);
  } catch (e) {
    result.errors.push(`Zoom summary read failed for ${tag}: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  if (!summary) {
    result.awaitingSummary += 1;
    return;
  }
  await writeSummaryStage(rec, tag, summary, await attendeesOf(token, rec, tag, result), siteOrigin, result);
}

// The card and the session page name everyone who joined, not only who spoke.
// A failed read falls back to the speakers and says so, so the run shows red
// once rather than the card quietly listing a few names.
async function attendeesOf(token: string, rec: ZoomRecording, tag: string, result: ZoomIngestResult): Promise<string[] | null> {
  try {
    return await listAttendees(token, rec.uuid);
  } catch (e) {
    result.errors.push(`attendee list failed for ${tag}, card names the speakers only: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

// Sessions ingested before 15 Oct 2026 named only the people who spoke. Each
// run fills in Zoom's attendee list for a few of them until none is left: the
// keys live only on the deployment, so the backfill runs where they are. The
// participant rows those sessions have are exactly their speakers, so only the
// attendees who never spoke are added and nothing is deleted. A meeting Zoom no
// longer has (404) is marked with an empty list so it is not asked again; any
// other failure is reported and retried on the next run.
const BACKFILL_PER_RUN = 5;

async function backfillAttendees(token: string, result: ZoomIngestResult): Promise<void> {
  const { data, error } = await groupSessionsMissingAttendees(BACKFILL_PER_RUN);
  if (error) {
    result.errors.push(`attendee backfill read failed: ${error.message}`);
    return;
  }
  for (const m of data ?? []) {
    if (!m.external_id) continue;
    let attendees: string[];
    try {
      attendees = await listAttendees(token, m.external_id);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!/HTTP 404/.test(message)) {
        result.errors.push(`attendee backfill failed for meeting ${m.id}: ${message}`);
        continue;
      }
      attendees = [];
    }
    // The metadata goes first: it is what the session page reads, and once it is
    // set the meeting leaves the backfill, so a retry can never add the rows twice.
    const { error: updateError } = await setMeetingMetadata(m.id, { ...(m.metadata ?? {}), attendees });
    if (updateError) {
      result.errors.push(`attendee backfill update failed for meeting ${m.id}: ${updateError.message}`);
      continue;
    }
    const spoke = new Set((Array.isArray(m.metadata?.speakers) ? (m.metadata.speakers as string[]) : []).map((n) => n.toLowerCase()));
    const silent = attendees.filter((name) => !spoke.has(name.toLowerCase()));
    if (silent.length > 0) {
      const { error: insertError } = await addMeetingParticipants(participantRows(m.id, silent));
      if (insertError) result.errors.push(`attendee backfill insert failed for meeting ${m.id}: ${insertError.message}`);
    }
    result.attendeesBackfilled += 1;
  }
}
