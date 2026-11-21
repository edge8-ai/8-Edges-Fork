// The key-learnings pass of the Zoom group-coaching ingest (Y.93, ADR 0017).
// For each stored coaching meeting that has a transcript and no learnings
// record, it finds the learning platform's session for that recording, writes
// three to eight learner-facing takeaways onto it, records what it did on the
// meeting row, and tells the coaching chat where to edit them.
//
// It reads stored meetings rather than riding the fresh ingest, because the two
// October 2026 sessions were already in by the time this existed, and because a
// platform session created after the recording still deserves its learnings.
//
// What a person wrote is never overwritten: a session with learnings and no
// record behind them is recorded as kept, once, and left alone for good. What
// the pass wrote is never rewritten either, because a written record ends the
// meeting's part in the pass.
import { groupSessionsAwaitingRecord, setMeetingMetadata, type SessionAwaitingRecord } from "@/entities/crm";
import { addDays } from "@/kernel/config/dates";
import type { Json } from "@/kernel/data/supabase/database.types";
import { sendLarkMessage } from "@/kernel/messaging/lark";
import { generateKeyLearnings } from "./key-learnings";
import {
  LEARNINGS_RECORD_KEY,
  MATCH_WINDOW_MS,
  decideWrite,
  matchLiveEvent,
  type LearningsRecord,
  type PlatformCoachingEvent,
} from "./key-learnings-match";
import { adminSessionUrl, learningPlatform, listCoachingEvents, writeEventLearnings } from "./learning-platform";

// Wider than the ingest's fourteen days, so the sessions stored before this pass
// existed are reached once; after that a run finds at most last Thursday.
export const LEARNINGS_LOOKBACK_DAYS = 30;

// Meetings handled per run. Each is one model call; three keeps a backlog
// moving and the run far inside the route's ceiling beside the ingest itself.
// Newest first: an unmatched meeting is retried every run by design, so oldest
// first would let three sessions with no platform row hold every slot for a
// month while last Thursday's learners waited.
export const LEARNINGS_PER_RUN = 3;

export type LearningsSyncResult = {
  enabled: boolean;
  reason?: string;
  checked: number;
  written: { meetingId: string; liveEventId: string; title: string; items: number }[];
  kept: number;
  unmatched: string[];
};

export const emptyLearningsSync = (): LearningsSyncResult => ({ enabled: false, checked: 0, written: [], kept: 0, unmatched: [] });

type MeetingRow = SessionAwaitingRecord;

/**
 * One pass. Lines that need a person (a read that failed, two candidate
 * sessions, a model or write failure) go to `errors`, which the routine reports
 * as a red run; a meeting with no platform session yet is listed, not failed,
 * and is retried next run. A failure on one meeting never stops the next.
 */
export async function syncKeyLearnings(todayISO: string, errors: string[]): Promise<LearningsSyncResult> {
  const result = emptyLearningsSync();
  const platform = learningPlatform();
  if (!platform.ok) return { ...result, reason: platform.reason };
  result.enabled = true;

  const { data, error } = await groupSessionsAwaitingRecord(LEARNINGS_RECORD_KEY, addDays(todayISO, -LEARNINGS_LOOKBACK_DAYS), LEARNINGS_PER_RUN);
  if (error) {
    errors.push(`key learnings read failed: ${error.message}`);
    return result;
  }
  const meetings = (data ?? []).filter((m) => m.started_at);
  if (meetings.length === 0) return result;

  // One platform read for the run, spanning every meeting's window.
  const starts = meetings.map((m) => Date.parse(m.started_at!));
  const listed = await listCoachingEvents(
    platform.platform,
    new Date(Math.min(...starts) - MATCH_WINDOW_MS).toISOString(),
    new Date(Math.max(...starts) + MATCH_WINDOW_MS).toISOString(),
  );
  if (!listed.ok) {
    errors.push(`key learnings platform read failed: ${listed.error}`);
    return result;
  }

  for (const meeting of meetings) {
    result.checked += 1;
    const label = `${meeting.started_at!.slice(0, 10)} "${meeting.title ?? ""}" (${meeting.id})`;
    try {
      await syncOne(meeting, label, listed.events, platform.platform, result, errors);
    } catch (e) {
      errors.push(`key learnings failed for ${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}

async function syncOne(
  meeting: MeetingRow,
  label: string,
  events: PlatformCoachingEvent[],
  platform: Parameters<typeof writeEventLearnings>[0],
  result: LearningsSyncResult,
  errors: string[],
): Promise<void> {
  const metadata = meeting.metadata ?? {};
  const transcript = typeof metadata.transcript === "string" ? metadata.transcript : "";
  // The read asks for a transcript, so this is a row whose transcript is the
  // empty string, which the ingest never writes: listed, like a meeting with no
  // session, rather than a red run every hour.
  if (!transcript.trim()) {
    result.unmatched.push(`${label}: no transcript`);
    return;
  }
  const zoomMeetingId = typeof metadata.zoom_meeting_id === "string" ? metadata.zoom_meeting_id : null;
  const match = matchLiveEvent({ zoomMeetingId, startedAt: meeting.started_at }, events);
  if (match.kind === "none") {
    result.unmatched.push(label);
    return;
  }
  const at = new Date().toISOString();
  if (match.kind === "ambiguous") {
    await recordOutcome(meeting, { outcome: "ambiguous", candidates: match.candidates, at }, errors, label);
    errors.push(
      `key learnings refused for ${label}: ${match.candidates.length} platform sessions fit (${match.candidates.join(", ")}); cancel the wrong one and clear the meeting's record`,
    );
    return;
  }
  const event = match.event;
  if (decideWrite(event.key_learnings) === "keep") {
    if (await recordOutcome(meeting, { outcome: "kept", live_event_id: event.id, at }, errors, label)) result.kept += 1;
    return;
  }
  const generated = await generateKeyLearnings(transcript);
  if (!generated.ok) {
    errors.push(`key learnings failed for ${label}: ${generated.error}`);
    return;
  }
  const written = await writeEventLearnings(platform, event.id, generated.items, event.key_learnings);
  if (!written.ok) {
    errors.push(`key learnings write failed for ${label}: ${written.error}`);
    return;
  }
  // The platform row is written before the record: if the record then fails,
  // the next run finds a non-empty list with no record and keeps it, so a
  // session is never written twice. The in-memory event is updated for the
  // same reason, so a second meeting in this run that matched the same
  // session keeps rather than writes over it.
  event.key_learnings = generated.items;
  await recordOutcome(meeting, { outcome: "written", live_event_id: event.id, items: generated.items, model: generated.model, at }, errors, label);
  const title = event.title?.trim() || "the group coaching session";
  result.written.push({ meetingId: meeting.id, liveEventId: event.id, title, items: generated.items.length });
  const notified = await sendLarkMessage(learningsNotice(title, generated.items.length, adminSessionUrl(event.id)));
  if (!notified) errors.push(`Lark post rejected or unconfigured for the key learnings of ${label}; the platform session ${event.id} is written.`);
}

/** The record on the meeting row. False, with the line pushed, when it could not be written. */
async function recordOutcome(meeting: MeetingRow, entry: LearningsRecord, errors: string[], label: string): Promise<boolean> {
  const { error } = await setMeetingMetadata(meeting.id, { ...(meeting.metadata ?? {}), [LEARNINGS_RECORD_KEY]: entry as unknown as Json });
  if (error) {
    errors.push(`key learnings record failed for ${label}: ${error.message}`);
    return false;
  }
  return true;
}

/** What the coaching chat is told when a session's learnings land. The title carries the session's number (#004). */
export function learningsNotice(title: string, count: number, adminUrl: string): string {
  return (
    `Key learnings posted for ${title}: ${count} item${count === 1 ? "" : "s"}, written from the transcript. ` +
    `Read or edit them at ${adminUrl}. A list edited there is never overwritten.`
  );
}
