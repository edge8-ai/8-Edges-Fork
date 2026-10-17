// Zoom group-coaching ingest: the hourly cron's body. Lists the coaching host's
// recent cloud recordings, skips the ones already in company_os.meetings,
// downloads each new transcript, writes our own actionable summary and its
// action items, and posts the result to the coaching Lark group.
//
// This replaces the operator-run scripts/crm/zoom-ingest.mjs, which needed a
// laptop to be open after every Thursday session. The rows it writes are the
// ones /team/coaching-sessions reads (./sessions.ts): source 'zoom', full
// transcript inline in metadata.transcript so a summary can be regenerated
// whenever the prompt improves, and metadata.source_meeting_type 'coaching'
// (the meetings trigger normalises meeting_type itself and preserves the
// original there).
//
// Failure isolation, in order of what matters: a transcript ALWAYS lands when
// Zoom has one, a failed summary marks the row pending rather than dropping
// it, and a rejected Lark post is reported in the run result rather than
// undoing the write. PostgREST has no transaction, so a child insert that
// fails unwinds the meeting row too; otherwise the dedup would skip a
// half-written session forever.
import {
  deleteMeetingActionItems,
  deleteMeetingParticipants,
  deleteMeetings,
  insertMeetingActionItems,
  insertMeetingParticipants,
  insertMeetings,
  selectMeetings,
  updateMeetings,
} from "@/entities/crm";
import { optionalEnv } from "@/kernel/config/env";
import { addDays } from "@/kernel/config/dates";
import type { Json } from "@/kernel/data/supabase/database.types";
import { sendLarkMessage } from "@/kernel/messaging/lark";
import { summarizeGroupSession, type GroupSummary } from "./group-summary";
import { buildSessionCard } from "./zoom-session-card";
import { emptyLearningsSync, syncKeyLearnings, type LearningsSyncResult } from "./key-learnings-sync";
import {
  downloadTranscript,
  getZoomToken,
  listRecordings,
  listAttendees,
  speakersFromText,
  vttToText,
  zoomCreds,
  type ZoomRecording,
} from "./zoom";

// How far back a run looks. Two weeks covers a Thursday whose transcript Zoom
// finished late plus one skipped week, without ever re-reading a whole term;
// anything older is the operator script's territory.
const LOOKBACK_DAYS = 14;

// Sessions ingested per run. One session is one transcript download and one
// Sonnet call, well under a minute; three keeps a backlog moving and the run
// far inside the route's 300s ceiling.
const MAX_PER_RUN = 3;

// A speaker whose display name contains ZOOM_HOST_NAME (case-insensitive)
// becomes the meeting's host row; every other speaker is an attendee. Unset,
// everyone is an attendee.
function hostMatcher(): RegExp | null {
  const name = optionalEnv("ZOOM_HOST_NAME");
  return name ? new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;
}

export type ZoomIngestResult = {
  enabled: boolean;
  reason?: string;
  host?: string;
  scanned: number;
  ingested: { id: string; title: string; summarized: boolean; notified: boolean }[];
  alreadyIngested: number;
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

export async function ingestZoomCoachingSessions(todayISO: string, siteOrigin: string): Promise<ZoomIngestResult> {
  const result: ZoomIngestResult = {
    enabled: false,
    scanned: 0,
    ingested: [],
    alreadyIngested: 0,
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
  let recordings: ZoomRecording[];
  try {
    const token = await getZoomToken(creds);
    recordings = (await listRecordings(token, cfg.host, addDays(todayISO, -LOOKBACK_DAYS)))
      .filter((r) => cfg.topic.test(r.topic ?? ""))
      .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
    result.scanned = recordings.length;
    for (const rec of recordings) {
      if (result.ingested.length >= MAX_PER_RUN) break;
      await ingestOne(token, rec, siteOrigin, result);
    }
    await backfillAttendees(token, result);
    result.learnings = await syncKeyLearnings(todayISO, result.errors);
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
  }
  return result;
}

async function ingestOne(token: string, rec: ZoomRecording, siteOrigin: string, result: ZoomIngestResult): Promise<void> {
  const tag = `${rec.start_time ?? "?"} "${rec.topic ?? ""}" (${rec.uuid})`;

  const { data: dupe, error: dedupError } = await selectMeetings("id")
    .eq("source", "zoom")
    .eq("external_id", rec.uuid)
    .limit(1)
    .maybeSingle();
  if (dedupError) {
    result.errors.push(`dedup query failed for ${tag}: ${dedupError.message}`);
    return;
  }
  if (dupe) {
    result.alreadyIngested += 1;
    return;
  }

  const file = await downloadTranscript(token, rec);
  const transcript = file ? vttToText(file.vtt) : "";
  if (!file || !transcript) {
    result.awaitingTranscript += 1;
    return;
  }

  // The card and the session page name everyone who joined, not only who spoke.
  // A failed read falls back to the speakers and says so, so the run shows red
  // once rather than the card quietly listing a few names.
  let attendees: string[] | null = null;
  try {
    attendees = await listAttendees(token, rec.uuid);
  } catch (e) {
    result.errors.push(`attendee list failed for ${tag}, card names the speakers only: ${e instanceof Error ? e.message : String(e)}`);
  }

  const summarized = await summarizeGroupSession(transcript);
  if (!summarized.ok) result.errors.push(`summary failed for ${tag}, transcript stored without it: ${summarized.error}`);
  const summary = summarized.ok ? summarized.summary : null;

  let meetingId: string;
  try {
    const written = await writeMeeting(rec, transcript, attendees, summary, summarized.ok ? summarized.model : null, file.downloadUrl);
    // Null: a run beside this one stored the recording first (Y.41).
    if (written === null) {
      result.alreadyIngested += 1;
      return;
    }
    meetingId = written;
  } catch (e) {
    result.errors.push(`write failed for ${tag}: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  const title = summary?.title.trim() || rec.topic || "Coaching session";
  const notified = await sendLarkMessage({
    card: buildSessionCard({
      title,
      dateLabel: rec.start_time ? rec.start_time.slice(0, 10) : null,
      speakers: attendees?.length ? attendees : speakersFromText(transcript),
      summaryMarkdown: summary?.summary_markdown ?? null,
      actionItemCount: summary?.action_items.length ?? 0,
      url: siteOrigin ? `${siteOrigin}/team/coaching-sessions/${meetingId}` : null,
    }),
  });
  if (!notified) result.errors.push(`Lark post rejected or unconfigured for ${tag}; the row ${meetingId} is written.`);
  result.ingested.push({ id: meetingId, title, summarized: summarized.ok, notified });
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
  const { data, error } = await selectMeetings("id, external_id, metadata")
    .eq("source", "zoom")
    .eq("metadata->>source_meeting_type", "coaching")
    .is("metadata->attendees", null)
    .order("started_at", { ascending: false })
    .limit(BACKFILL_PER_RUN);
  if (error) {
    result.errors.push(`attendee backfill read failed: ${error.message}`);
    return;
  }
  const rows = (data ?? []) as unknown as { id: string; external_id: string | null; metadata: Record<string, Json> | null }[];
  const host = hostMatcher();
  for (const m of rows) {
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
    const { error: updateError } = await updateMeetings({ metadata: { ...(m.metadata ?? {}), attendees } }).eq("id", m.id);
    if (updateError) {
      result.errors.push(`attendee backfill update failed for meeting ${m.id}: ${updateError.message}`);
      continue;
    }
    const spoke = new Set((Array.isArray(m.metadata?.speakers) ? (m.metadata.speakers as string[]) : []).map((n) => n.toLowerCase()));
    const silent = attendees.filter((name) => !spoke.has(name.toLowerCase()));
    if (silent.length > 0) {
      const { error: insertError } = await insertMeetingParticipants(
        silent.map((name) => ({
          meeting_id: m.id,
          person_id: null,
          external_email: null,
          display_name: name,
          role: host?.test(name) ? "host" : "attendee",
          attended: true,
        })),
      );
      if (insertError) result.errors.push(`attendee backfill insert failed for meeting ${m.id}: ${insertError.message}`);
    }
    result.attendeesBackfilled += 1;
  }
}

async function writeMeeting(
  rec: ZoomRecording,
  transcript: string,
  attendees: string[] | null,
  summary: GroupSummary | null,
  model: string | null,
  downloadUrl: string,
): Promise<string | null> {
  const durationSec = rec.duration ? rec.duration * 60 : null;
  const startedAt = rec.start_time ?? null;
  const endedAt =
    startedAt && durationSec ? new Date(new Date(startedAt).getTime() + durationSec * 1000).toISOString() : null;
  const speakers = speakersFromText(transcript);
  const people = attendees?.length ? attendees : speakers;
  const host = hostMatcher();

  const metadata: Record<string, Json> = {
    source: "zoom",
    source_file: downloadUrl,
    zoom_meeting_id: String(rec.id),
    zoom_uuid: rec.uuid,
    meeting_date: startedAt ? startedAt.slice(0, 10) : null,
    speakers,
    ...(attendees?.length ? { attendees } : {}),
    transcript,
    ...(model ? { ai_model: model } : { ai_status: "pending" }),
  };

  const { data: row, error: insertError } = await insertMeetings({
    source: "zoom",
    external_id: rec.uuid,
    title: summary?.title.trim() || rec.topic || "Coaching session",
    meeting_type: "coaching",
    summary: summary?.summary_markdown ?? null,
    summary_encrypted: false,
    recording_url: rec.share_url ?? null,
    // No owner: resolving the host to a people row by name is the intake
    // hazard the company-os rules warn about, and nothing reads owner_id here.
    owner_id: null,
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: durationSec,
    metadata,
  })
    .select("id")
    .single();
  // The unique index on (source, external_id) is what stops a double fire
  // writing a recording twice: the check above and this insert are not one
  // step. The second insert's refusal is the recording already being in (Y.41).
  if (insertError?.code === "23505") return null;
  if (insertError || !row) throw new Error(`meetings insert failed: ${insertError?.message ?? "no row returned"}`);
  const meetingId = (row as { id: string }).id;

  try {
    if (people.length > 0) {
      const { error: participantsError } = await insertMeetingParticipants(
        people.map((name) => ({
          meeting_id: meetingId,
          person_id: null,
          external_email: null,
          display_name: name,
          role: host?.test(name) ? "host" : "attendee",
          attended: true,
        })),
      );
      if (participantsError) throw new Error(`participants insert failed: ${participantsError.message}`);
    }
    if (summary && summary.action_items.length > 0) {
      const { error: itemsError } = await insertMeetingActionItems(
        summary.action_items.map((it, i) => ({
          meeting_id: meetingId,
          title: it.title,
          detail: actionDetail(it.detail, it.owner),
          assignee_id: null,
          due_date: dueDateOrNull(it.due_date),
          status: "open",
          position: i,
        })),
      );
      if (itemsError) throw new Error(`action items insert failed: ${itemsError.message}`);
    }
  } catch (e) {
    await deleteMeetingActionItems().eq("meeting_id", meetingId);
    await deleteMeetingParticipants().eq("meeting_id", meetingId);
    await deleteMeetings().eq("id", meetingId);
    throw e;
  }
  return meetingId;
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
