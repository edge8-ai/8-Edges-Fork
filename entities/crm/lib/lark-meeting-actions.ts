"use server";

import { revalidateSurfaces } from "@/kernel/shell/surface";
import { runInBackground } from "@/kernel/audit/background";
import { companyOs } from "@/kernel/data/supabase";
import { one } from "@/kernel/config/embedded";
import { larkWorkspaceHost } from "@/kernel/config/lark";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { fetchMinutesTranscript, fetchMinuteStartedAt, larkAppName, larkConfigured } from "@/kernel/messaging/lark-api";
import { summarizeMeeting } from "@/entities/assistant";
import { meetingTranscript } from "./meetings";
import { parseLarkMinutesLink } from "./lark-minutes-link";

// Z.5, paste-a-link intake: anyone who reviews sales calls pastes the Lark
// Minutes link of a client call, and the call lands as a CRM meeting with its
// transcript, where the chains already look. Decided 2026-10-10: paste-a-link
// only, no Lark events and no per-person consent, so the recording is read
// with the Edge8 app's own identity, as coaching's linked pass reads a pasted
// 1-1 link (entities/coaching/lib/cycle-minutes.ts).
//
// Where it lands, and why there:
//   - meetings: source 'lark' and external_id the minute token, the shape the
//     Lark meetings already on record have. The unique index on
//     (source, external_id) is what makes a second paste find the first.
//   - call_transcripts: the transcript, keyed by meeting_id and minute_token,
//     as the notes upload stores it. The summariser reads it from there, and
//     once the summary lands the proposal chain (Z.10, a Sales meeting with a
//     summary) and the meeting-actions chain (Z.13) pick the meeting up.
// A recording the app may not read (its owner has not shared it with the app)
// still keeps its meeting row, with the reason on ai_error, so the link is
// never lost and the list shows it as failed rather than nothing at all.
// Pasting the same link again is the retry.

export type LarkMeetingState = "loaded" | "already-loaded" | "not-shared" | "not-ready";

export type LarkMeetingResult =
  | { ok: true; meetingId: string; state: LarkMeetingState; message: string }
  | { ok: false; error: string };

const MEETING_TYPES = ["Sales", "General"] as const;
type MeetingType = (typeof MEETING_TYPES)[number];

// Postgres' unique-violation SQLSTATE: another paste of the same link got there first.
const UNIQUE_VIOLATION = "23505";

const WHAT = "[crm/lark-meeting]";

type Found = { id: string; companyId: string | null; loaded: boolean };

export async function addLarkMeeting(formData: FormData): Promise<LarkMeetingResult> {
  const { user } = await requirePermission("crm.calls");

  const link = parseLarkMinutesLink(String(formData.get("url") ?? ""), larkWorkspaceHost());
  if (!link.ok) return link;
  const companyId = String(formData.get("companyId") ?? "").trim();
  if (!companyId) return { ok: false, error: "Choose the client the call was with." };
  const rawType = String(formData.get("meetingType") ?? "").trim() || "Sales";
  if (!(MEETING_TYPES as readonly string[]).includes(rawType)) return { ok: false, error: "Choose Sales or General." };
  const meetingType = rawType as MeetingType;
  if (!larkConfigured()) {
    return { ok: false, error: "The Lark app is not configured on this site (LARK_APP_ID, LARK_APP_SECRET), so a recording cannot be read." };
  }

  // Pasted before, or already filed another way: use that meeting.
  let found = await findMeeting(link.token);
  if (!found.ok) return found;
  let meeting = found.meeting;

  if (!meeting) {
    const { data, error } = await companyOs
      .from("meetings")
      .insert({
        source: "lark",
        external_id: link.token,
        company_id: companyId,
        meeting_type: meetingType,
        recording_url: link.url,
        ai_status: "pending",
        created_by: user.email,
        metadata: { lark_minute_token: link.token, origin: "pasted_link" },
      })
      .select("id")
      .single();
    if (error?.code === UNIQUE_VIOLATION) {
      // A paste of the same link beside this one created it first; adopt it.
      found = await findMeeting(link.token);
      if (!found.ok) return found;
      meeting = found.meeting;
    } else if (error || !data) {
      return { ok: false, error: `Could not save the meeting: ${error?.message ?? "no row came back"}` };
    } else {
      meeting = { id: (data as { id: string }).id, companyId, loaded: false };
      await recordAudit({ table: "meetings", recordId: meeting.id, operation: "insert", actor: user.email, context: { origin: "lark_link" } });
    }
    if (!meeting) return { ok: false, error: "Could not save the meeting." };
  }

  if (!meeting.companyId) {
    return { ok: false, error: "This recording is already filed as an internal meeting, not a client one, so it is not added here." };
  }
  if (meeting.loaded) {
    return { ok: true, meetingId: meeting.id, state: "already-loaded", message: "This meeting is already on record with its transcript." };
  }

  const result = await loadTranscript(meeting.id, link.token, meetingType);
  refresh(meeting.companyId, meeting.id);
  return result;
}

/**
 * The meeting a minute token already belongs to: the Lark meeting filed under
 * it, or the meeting its transcript is attached to. A failed read is an error,
 * never "not found": that answer would file the same call twice.
 */
async function findMeeting(token: string): Promise<{ ok: true; meeting: Found | null } | { ok: false; error: string }> {
  const { data: byLink, error: linkError } = await companyOs
    .from("meetings")
    .select("id")
    .eq("source", "lark")
    .eq("external_id", token)
    .limit(1)
    .maybeSingle();
  if (linkError) return { ok: false, error: `Could not check whether this meeting is already on record: ${linkError.message}` };

  let id = (byLink as { id: string } | null)?.id ?? null;
  if (!id) {
    const { data: byTranscript, error: transcriptError } = await companyOs
      .from("call_transcripts")
      .select("meeting_id")
      .eq("minute_token", token)
      .limit(1)
      .maybeSingle();
    if (transcriptError) return { ok: false, error: `Could not check whether this meeting is already on record: ${transcriptError.message}` };
    id = (byTranscript as { meeting_id: string | null } | null)?.meeting_id ?? null;
  }
  if (!id) return { ok: true, meeting: null };

  const { data, error } = await companyOs
    .from("meetings")
    .select("id, company_id, metadata, call_transcripts(transcript)")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: `Could not read the meeting already on record: ${error.message}` };
  if (!data) return { ok: true, meeting: null };
  const row = data as {
    id: string;
    company_id: string | null;
    metadata: Record<string, unknown> | null;
    call_transcripts: { transcript: string | null }[] | { transcript: string | null } | null;
  };
  return {
    ok: true,
    meeting: {
      id: row.id,
      companyId: row.company_id,
      loaded: meetingTranscript(one(row.call_transcripts)?.transcript, row.metadata).trim() !== "",
    },
  };
}

/** Read the recording as the app, store its transcript, and start the summary. */
async function loadTranscript(meetingId: string, token: string, meetingType: MeetingType): Promise<LarkMeetingResult> {
  const pull = await fetchMinutesTranscript(token);
  if (!pull.ok) {
    const state = pull.reason === "denied" ? "not-shared" : "not-ready";
    const message = state === "not-shared" ? notSharedMessage(await larkAppName()) : NOT_READY_MESSAGE;
    // The reason goes on the row, so the meeting page and the list say why
    // there is no summary instead of showing an empty meeting.
    const { error } = await companyOs
      .from("meetings")
      .update({ ai_status: "failed", ai_error: `Transcript not loaded. ${message}`, updated_at: new Date().toISOString() })
      .eq("id", meetingId);
    if (error) return { ok: false, error: `The link is saved, but the meeting could not be updated: ${error.message}` };
    console.warn(`${WHAT} ${meetingId}: transcript not loaded (${pull.reason})`);
    return { ok: true, meetingId, state, message };
  }

  const startedAt = await fetchMinuteStartedAt(token);
  const { error: transcriptError } = await companyOs.from("call_transcripts").insert({
    meeting_id: meetingId,
    minute_token: token,
    title: "Lark meeting",
    started_at: startedAt,
    source: "lark_minutes",
    // The proposal chain also drafts from a transcript typed as a sales call.
    call_type: meetingType === "Sales" ? "sales" : "client",
    transcript: pull.transcript,
  });
  if (transcriptError?.code === UNIQUE_VIOLATION) {
    // A paste beside this one stored the same transcript a moment ago.
    return { ok: true, meetingId, state: "already-loaded", message: "This meeting is already on record with its transcript." };
  }
  if (transcriptError) {
    return { ok: false, error: `The link is saved, but the transcript could not be stored: ${transcriptError.message}. Paste the link again to retry.` };
  }

  const { error: statusError } = await companyOs
    .from("meetings")
    .update({ ai_status: "pending", ai_error: null, updated_at: new Date().toISOString() })
    .eq("id", meetingId);
  if (statusError) return { ok: false, error: `The transcript is stored, but the meeting could not be updated: ${statusError.message}` };
  // The recording's own start time beats the summariser's guess from the
  // text, and it lands before the summariser runs, which fills only a blank
  // date. A date somebody already set is kept.
  if (startedAt) {
    const { error: dateError } = await companyOs.from("meetings").update({ started_at: startedAt }).eq("id", meetingId).is("started_at", null);
    if (dateError) console.error(`${WHAT} ${meetingId}: meeting date not set: ${dateError.message}`);
  }

  runInBackground("/background/meeting-summary/", `meeting ${meetingId}`, () => summarizeMeeting(meetingId));
  return { ok: true, meetingId, state: "loaded", message: "Transcript loaded from Lark. Summarizing…" };
}

function notSharedMessage(appName: string | null): string {
  const app = appName ? `the app “${appName}”` : "our company's Lark app";
  return (
    "Lark will not let us read this recording yet: its owner has not shared it with our Lark app. " +
    `Ask the person who recorded the call to open it in Lark Minutes, choose Share, and add ${app} with permission to view. ` +
    "Then paste the link here again to load the transcript."
  );
}

const NOT_READY_MESSAGE =
  "Lark has no transcript for this recording yet, or did not answer. Lark can take a while after a call ends; paste the link here again later to load it.";

function refresh(companyId: string, meetingId: string): void {
  revalidateSurfaces("/revenue/meetings");
  revalidateSurfaces(`/revenue/meetings/${meetingId}`);
  revalidateSurfaces(`/revenue/companies/${companyId}`);
}
