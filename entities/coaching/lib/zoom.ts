// Zoom Server-to-Server OAuth client, read-only: list one host's cloud
// recordings and download the full VTT transcript of a meeting. The TypeScript
// port of scripts/crm/zoom.mjs, so the hourly cron can do what the operator
// script did from a laptop (docs/plans/2026-08-27-zoom-coaching-ingestion.md).
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
