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
} from "@/entities/crm";
import { optionalEnv } from "@/kernel/config/env";
import { addDays } from "@/kernel/config/dates";
import type { Json } from "@/kernel/data/supabase/database.types";
import { sendLarkMessage } from "@/kernel/messaging/lark";
// A Lark interactive card body, as kernel/messaging/lark.ts posts it.
type LarkCard = Record<string, unknown>;
import { summarizeGroupSession, type GroupSummary } from "./group-summary";
import {
  downloadTranscript,
  getZoomToken,
  listRecordings,
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

  const summarized = await summarizeGroupSession(transcript);
  if (!summarized.ok) result.errors.push(`summary failed for ${tag}, transcript stored without it: ${summarized.error}`);
  const summary = summarized.ok ? summarized.summary : null;

  let meetingId: string;
  try {
    const written = await writeMeeting(rec, transcript, summary, summarized.ok ? summarized.model : null, file.downloadUrl);
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
      speakers: speakersFromText(transcript),
      summaryMarkdown: summary?.summary_markdown ?? null,
      actionItemCount: summary?.action_items.length ?? 0,
      url: siteOrigin ? `${siteOrigin}/team/coaching-sessions/${meetingId}` : null,
    }),
  });
  if (!notified) result.errors.push(`Lark post rejected or unconfigured for ${tag}; the row ${meetingId} is written.`);
  result.ingested.push({ id: meetingId, title, summarized: summarized.ok, notified });
}

async function writeMeeting(
  rec: ZoomRecording,
  transcript: string,
  summary: GroupSummary | null,
  model: string | null,
  downloadUrl: string,
): Promise<string | null> {
  const durationSec = rec.duration ? rec.duration * 60 : null;
  const startedAt = rec.start_time ?? null;
  const endedAt =
    startedAt && durationSec ? new Date(new Date(startedAt).getTime() + durationSec * 1000).toISOString() : null;
  const speakers = speakersFromText(transcript);
  const host = hostMatcher();

  const metadata: Record<string, Json> = {
    source: "zoom",
    source_file: downloadUrl,
    zoom_meeting_id: String(rec.id),
    zoom_uuid: rec.uuid,
    meeting_date: startedAt ? startedAt.slice(0, 10) : null,
    speakers,
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
    if (speakers.length > 0) {
      const { error: participantsError } = await insertMeetingParticipants(
        speakers.map((name) => ({
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

/** The TL;DR section of a summary, or its opening lines when the section is missing. */
export function tldrOf(summaryMarkdown: string): string {
  const m = /##\s*TL;DR\s*\n+([\s\S]*?)(?=\n##\s|\s*$)/i.exec(summaryMarkdown);
  const text = (m ? m[1] : summaryMarkdown).trim();
  return text.length > 600 ? `${text.slice(0, 597)}...` : text;
}

export type SessionCardInput = {
  title: string;
  dateLabel: string | null;
  speakers: string[];
  summaryMarkdown: string | null;
  actionItemCount: number;
  url: string | null;
};

/** The Lark card announcing one ingested session to the coaching group. */
export function buildSessionCard(input: SessionCardInput): LarkCard {
  const lines: string[] = [];
  if (input.dateLabel) lines.push(`**Date:** ${input.dateLabel}`);
  lines.push(`**Participants:** ${input.speakers.length > 0 ? input.speakers.join(", ") : "not detected"}`);
  const elements: Record<string, unknown>[] = [{ tag: "div", text: { tag: "lark_md", content: lines.join("\n") } }];
  elements.push({ tag: "hr" });
  elements.push({
    tag: "div",
    text: {
      tag: "lark_md",
      content: input.summaryMarkdown
        ? tldrOf(input.summaryMarkdown)
        : "The transcript is stored. The summary did not generate on this run; it will be regenerated.",
    },
  });
  const footer: string[] = [];
  if (input.summaryMarkdown) footer.push(`${input.actionItemCount} action item${input.actionItemCount === 1 ? "" : "s"}`);
  if (input.url) footer.push(`[Read the full summary and transcript](${input.url})`);
  if (footer.length > 0) elements.push({ tag: "div", text: { tag: "lark_md", content: footer.join("  ·  ") } });
  return {
    config: { wide_screen_mode: true },
    header: { title: { tag: "plain_text", content: `Coaching session: ${input.title}` } },
    elements,
  };
}
