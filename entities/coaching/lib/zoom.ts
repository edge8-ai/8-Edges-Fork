// Zoom Server-to-Server OAuth client, read-only: list one host's cloud
// recordings, download the full VTT transcript of a meeting, and read Zoom's
// own AI Companion summary of it. The TypeScript port of scripts/crm/zoom.mjs,
// so the hourly cron can do what the operator script did from a laptop
// (docs/plans/2026-08-27-zoom-coaching-ingestion.md).
//
// Credentials come from the environment only. The script fell back to
// ~/.claude/.env, which a Vercel function does not have; here an unset
// variable means the ingest is off, and the cron says so in its result.
import { optionalEnv } from "@/kernel/config/env";

export type ZoomCreds = { accountId: string; clientId: string; clientSecret: string };

export type ZoomRecordingFile = {
  recording_type?: string;
  download_url?: string;
};

export type ZoomRecording = {
  uuid: string;
  id: number | string;
  topic?: string;
  start_time?: string;
  duration?: number;
  share_url?: string;
  recording_files?: ZoomRecordingFile[];
};

/** The S2S app credentials, or null when any of the three is unset. */
export function zoomCreds(): ZoomCreds | null {
  const accountId = optionalEnv("ZOOM_ACCOUNT_ID");
  const clientId = optionalEnv("ZOOM_CLIENT_ID");
  const clientSecret = optionalEnv("ZOOM_CLIENT_SECRET");
  if (!accountId || !clientId || !clientSecret) return null;
  return { accountId, clientId, clientSecret };
}

export async function getZoomToken(creds: ZoomCreds): Promise<string> {
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(creds.accountId)}`;
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Basic ${basic}` } });
  if (!res.ok) throw new Error(`Zoom token failed: HTTP ${res.status}`);
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("Zoom token response carried no access_token.");
  return body.access_token;
}

async function api<T>(token: string, pathAndQuery: string): Promise<T> {
  const res = await fetch(`https://api.zoom.us/v2${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Zoom GET ${pathAndQuery} -> HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** Cloud recordings for one host from `from` (YYYY-MM-DD) to today, every page. */
export async function listRecordings(token: string, hostEmail: string, from: string): Promise<ZoomRecording[]> {
  const out: ZoomRecording[] = [];
  let next = "";
  do {
    const page = await api<{ meetings?: ZoomRecording[]; next_page_token?: string }>(
      token,
      `/users/${encodeURIComponent(hostEmail)}/recordings?from=${from}&page_size=100${next ? `&next_page_token=${next}` : ""}`,
    );
    out.push(...(page.meetings ?? []));
    next = page.next_page_token ?? "";
  } while (next);
  return out;
}


/**
 * A meeting UUID as Zoom wants it in a path: encoded twice when it starts with
 * "/" or contains "//", once otherwise.
 */
export function meetingPath(uuid: string): string {
  const once = encodeURIComponent(uuid);
  return uuid.startsWith("/") || uuid.includes("//") ? encodeURIComponent(once) : once;
}

/**
 * The passcode that opens a session's recording share link, read from Zoom
 * when the page renders so it is never stored. Null when Zoom is not
 * configured, the recording has no passcode, or the lookup fails: the page
 * then shows the link alone.
 */
export async function recordingPasscode(zoomUuid: string): Promise<string | null> {
  const creds = zoomCreds();
  if (!creds) return null;
  try {
    const token = await getZoomToken(creds);
    const settings = await api<{ password?: string }>(token, `/meetings/${meetingPath(zoomUuid)}/recordings/settings`);
    return settings.password || null;
  } catch (error) {
    console.error("[coaching] Zoom recording passcode", error);
    return null;
  }
}

type ZoomParticipant = { name?: string; user_email?: string };

/**
 * Everyone who joined a past meeting, from Zoom's participant list, one entry
 * per person in join order. The transcript only names the people who spoke, so
 * a session where most of the room listened came out with a short, wrong
 * participant line (15 Oct 2026: six speakers named, 22 attendees).
 *
 * A person who rejoins appears once per join; they are merged on email when
 * Zoom has one, otherwise on the name.
 */
export async function listAttendees(token: string, uuid: string): Promise<string[]> {
  const id = meetingPath(uuid);
  const rows: ZoomParticipant[] = [];
  let next = "";
  do {
    const page = await api<{ participants?: ZoomParticipant[]; next_page_token?: string }>(
      token,
      `/past_meetings/${id}/participants?page_size=300${next ? `&next_page_token=${next}` : ""}`,
    );
    rows.push(...(page.participants ?? []));
    next = page.next_page_token ?? "";
  } while (next);
  return distinctAttendees(rows);
}

/** One display name per person, in first-join order, merged on email or else on the name. */
export function distinctAttendees(rows: ZoomParticipant[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const name = r.name?.replace(/\s+/g, " ").trim();
    if (!name) continue;
    const key = r.user_email?.trim().toLowerCase() || `name:${name.toLowerCase()}`;
    const nameKey = `name:${name.toLowerCase()}`;
    if (seen.has(key) || seen.has(nameKey)) continue;
    seen.add(key);
    seen.add(nameKey);
    out.push(name);
  }
  return out;
}

/**
 * The audio_transcript (VTT) of a recording, or null when Zoom has not
 * produced one yet: the recording is still processing, or transcription was
 * off for that meeting. Zoom accepts the bearer token as a query parameter on
 * download_url.
 */
export async function downloadTranscript(
  token: string,
  meeting: ZoomRecording,
): Promise<{ vtt: string; downloadUrl: string } | null> {
  const file = (meeting.recording_files ?? []).find((f) => f.recording_type === "audio_transcript");
  if (!file?.download_url) return null;
  const res = await fetch(`${file.download_url}?access_token=${token}`);
  if (!res.ok) return null;
  return { vtt: await res.text(), downloadUrl: file.download_url };
}

/**
 * WebVTT to a readable transcript: keeps the "Speaker: line" text and drops
 * the WEBVTT header, cue indices and timestamp lines. The same cleanup the
 * operator script applied, so rows from either route look alike.
 */
export function vttToText(vtt: string): string {
  return vtt
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^WEBVTT/i.test(l) && !/^\d+$/.test(l) && !/-->/.test(l))
    .join("\n")
    .trim();
}

// Zoom prefixes each cue with the speaker's display name. A label is trusted
// only when it looks like a name (1-4 capitalised words) AND opens two or more
// lines, which drops mid-sentence colons ("the plan is: ship it") that would
// otherwise become participant rows.
const NAME_LABEL = /^[A-Z][\p{L}.'-]*(?:\s+[A-Z][\p{L}.'-]*){0,3}$/u;

/** Distinct speaker names from a cleaned transcript. */
export function speakersFromText(text: string): string[] {
  const counts = new Map<string, number>();
  for (const line of text.split("\n")) {
    const m = line.match(/^([^:]{1,60}):\s+\S/);
    if (!m) continue;
    const label = m[1].trim();
    if (!NAME_LABEL.test(label)) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n >= 2).map(([name]) => name);
}

/**
 * Zoom's own AI Companion summary of a meeting: the one the host sees in Zoom
 * within a minute of the call ending, long before the recording is processed
 * and its transcript exists (29 Oct 2026: summary at 11:35 Saigon, transcript
 * after 12:15). Edits a person made in Zoom win over the generated text.
 */
export type ZoomMeetingSummary = {
  title: string;
  overview: string;
  details: { label: string; summary: string }[];
  nextSteps: string[];
  createdAt: string | null;
};

type ZoomSummaryDetail = { label?: string; summary?: string };
type ZoomSummaryResponse = {
  summary_title?: string;
  summary_overview?: string;
  summary_details?: ZoomSummaryDetail[];
  next_steps?: string[];
  summary_created_time?: string;
  edited_summary?: { summary_details?: ZoomSummaryDetail[]; next_steps?: string[] };
};

/**
 * The AI Companion summary of a meeting, or null while Zoom has none: the
 * meeting is still running, the summary is still being written, or the
 * feature was off for it. Zoom answers 404 (and, for some accounts, 400) in
 * every one of those cases, so both read as "not yet"; a summary with neither
 * an overview nor a section is one Zoom is still filling and reads the same.
 */
export async function getMeetingSummary(token: string, uuid: string): Promise<ZoomMeetingSummary | null> {
  let body: ZoomSummaryResponse;
  try {
    body = await api<ZoomSummaryResponse>(token, `/meetings/${meetingPath(uuid)}/meeting_summary`);
  } catch (e) {
    if (e instanceof Error && /HTTP 40[04]\b/.test(e.message)) return null;
    throw e;
  }
  const edited = body.edited_summary;
  const details = (edited?.summary_details ?? body.summary_details ?? []).flatMap((d) => {
    const summary = d.summary?.trim();
    return summary ? [{ label: d.label?.trim() || "Details", summary }] : [];
  });
  const nextSteps = (edited?.next_steps ?? body.next_steps ?? []).map((s) => s.trim()).filter(Boolean);
  const overview = body.summary_overview?.trim() ?? "";
  if (!overview && details.length === 0) return null;
  return { title: body.summary_title?.trim() ?? "", overview, details, nextSteps, createdAt: body.summary_created_time ?? null };
}

/**
 * Zoom's summary as markdown with the sections our own summary uses, so the
 * session page and the card's TL;DR read the same whichever one the row holds.
 */
export function zoomSummaryMarkdown(s: ZoomMeetingSummary): string {
  const parts: string[] = [];
  if (s.overview) parts.push(`## TL;DR\n${s.overview}`);
  for (const d of s.details) parts.push(`## ${d.label}\n${d.summary}`);
  if (s.nextSteps.length > 0) parts.push(`## Next steps\n${s.nextSteps.map((step) => `- ${step}`).join("\n")}`);
  return parts.join("\n\n");
}
