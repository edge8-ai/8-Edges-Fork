// Which learning-platform session a group coaching recording belongs to, and
// whether the automation may write that session's learnings. Pure: these are
// the rules the key-learnings pass applies (ADR 0017), provable without Zoom,
// the model or the platform.

/** A coaching session as the learning platform lists it, the fields the match reads. */
export type PlatformCoachingEvent = {
  id: string;
  title: string | null;
  scheduled_at: string | null;
  status: string | null;
  meeting_url: string | null;
  key_learnings: unknown;
};

// How far a session's scheduled time may sit from the recording's start. The
// 8 October 2026 session was scheduled at 03:11 UTC and recorded from 04:02, so
// an hour is not enough; a Thursday has one group session, so three hours is
// still nowhere near the next one.
export const MATCH_WINDOW_MS = 3 * 60 * 60 * 1000;

/** The Zoom meeting id in a join link (`…/j/81941198605?pwd=…`), or null. */
export function zoomMeetingIdOf(joinLink: string | null | undefined): string | null {
  if (!joinLink) return null;
  const m = /\/j\/(\d{6,})/.exec(joinLink);
  return m ? m[1] : null;
}

export type MatchResult =
  | { kind: "match"; event: PlatformCoachingEvent }
  | { kind: "none" }
  | { kind: "ambiguous"; candidates: string[] };

/**
 * The session a recording belongs to. A candidate carries the recording's Zoom
 * meeting id in its join link, is not cancelled, and is scheduled within the
 * window of the recording's start; the nearest wins. Two candidates inside the
 * window are refused rather than guessed: learnings on the wrong Thursday are
 * worse than none, and the platform keeps a cancelled twin beside most sessions.
 */
export function matchLiveEvent(
  recording: { zoomMeetingId: string | null; startedAt: string | null },
  events: PlatformCoachingEvent[],
): MatchResult {
  if (!recording.zoomMeetingId || !recording.startedAt) return { kind: "none" };
  const started = Date.parse(recording.startedAt);
  if (Number.isNaN(started)) return { kind: "none" };
  const candidates = events
    .filter((e) => e.status !== "cancelled" && zoomMeetingIdOf(e.meeting_url) === recording.zoomMeetingId)
    .map((e) => ({ e, gap: e.scheduled_at ? Math.abs(Date.parse(e.scheduled_at) - started) : Number.NaN }))
    .filter((c) => !Number.isNaN(c.gap) && c.gap <= MATCH_WINDOW_MS)
    .sort((a, b) => a.gap - b.gap || a.e.id.localeCompare(b.e.id));
  if (candidates.length === 0) return { kind: "none" };
  if (candidates.length > 1) return { kind: "ambiguous", candidates: candidates.map((c) => c.e.id) };
  return { kind: "match", event: candidates[0].e };
}

/** The key under meetings.metadata that holds what the pass did for this meeting. */
export const LEARNINGS_RECORD_KEY = "platform_learnings";

/**
 * What the pass did for one meeting, kept on the meeting row. `written` and
 * `kept` end the meeting's part in the pass; `ambiguous` too, until a person
 * clears it. An unmatched meeting gets no record, so it is retried every run.
 */
export type LearningsRecord =
  | { outcome: "written"; live_event_id: string; items: string[]; model: string; at: string }
  | { outcome: "kept"; live_event_id: string; at: string }
  | { outcome: "ambiguous"; candidates: string[]; at: string };

/** The learnings a session carries, as a list of non-empty strings; jsonb has no shape guarantee. */
export function learningsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean);
}

/**
 * Write when the session's learnings are empty. Anything else is a list a
 * person wrote and is kept for good; what the pass itself wrote is never
 * rewritten either, because a written record ends the meeting's part in the
 * pass (./key-learnings-sync).
 */
export function decideWrite(current: unknown): "write" | "keep" {
  return learningsOf(current).length === 0 ? "write" : "keep";
}
