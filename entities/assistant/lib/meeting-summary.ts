import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import { MEETING_SUMMARY_PROMPT } from "./meeting-summary.prompt";
import type { AiDataClass } from "@/kernel/ai/routing";
import { companyOs } from "@/kernel/data/supabase";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { selectMeetings, updateMeetings } from "@/entities/crm";
import { z } from "zod/v4";

// Summarize a client meeting transcript. Reads the transcript from
// call_transcripts (for a source='notes' or source='lark' meetings row) and asks Claude for a
// title, a concise summary, the attendee list, and the meeting date.
// Same never-throws contract as lib/ai/idea-plan.ts and lib/resume-screen.ts:
// called fire-and-forget (waitUntil) from the meeting actions and from admin
// retry, it always resolves and records failures on ai_error.
//
// Coalesce rule: title, attendees, and meeting_date are only written when the
// row is still blank/empty, so an admin's manual value is never overwritten. The
// summary is always (re)generated.

export const MEETING_SUMMARY_CLASS: AiDataClass = "C";
const AI = aiSite({ site: "meeting-summary", dataClass: MEETING_SUMMARY_CLASS, tier: "fast" });
const MODEL = AI.model;

// Keep the transcript within a sane token budget. Meetings rarely exceed this;
// if one does, the tail is dropped and noted (summary of the bulk still lands).
const MAX_TRANSCRIPT_CHARS = 120_000;

export const meetingSummaryOutput = z.object({
  title: z.string().describe("A short, specific meeting title (max ~8 words) naming what the meeting was about. No date, no company name padding — e.g. 'Q3 roadmap and rollout plan'."),
  summary_markdown: z.string().describe("A concise client-facing summary in Markdown, under ~250 words. Structure: a one-line overview sentence; then '## Key points' (3-6 bullets of what was discussed/decided); then '## Action items' (bullets as 'Owner - task', or 'None noted' if there were none). Ground everything in the transcript; do not invent decisions, numbers, or owners that were not said. Neutral, professional tone."),
  attendees: z.array(z.string()).describe("The names of people who attended, as spoken/named in the transcript. Names only (no titles/emails). Empty array if the transcript gives no reliable way to tell who was present."),
  meeting_date: z.string().nullable().describe("The calendar date the meeting took place, as YYYY-MM-DD, if it can be determined from the transcript (an explicit date, or a clearly stated day). Null if it cannot be determined — do not guess."),
});

const SCHEMA = jsonSchemaFor(meetingSummaryOutput);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const SUMMARISED_SOURCES = ["notes", "lark"];

type Ok = { ok: true };
type Err = { ok: false; error: string };

async function markFailed(id: string, error: string): Promise<Err> {
  await updateMeetings({ ai_status: "failed", ai_error: error.slice(0, 500), updated_at: new Date().toISOString() })
    .eq("id", id);
  return { ok: false, error };
}

export async function summarizeMeeting(meetingId: string): Promise<Ok | Err> {
  try {
    return await run(meetingId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[meeting-summary] ${meetingId} failed:`, msg);
    return markFailed(meetingId, msg);
  }
}

async function run(meetingId: string): Promise<Ok | Err> {
  const llm = AI.clientIfConfigured();
  if (!llm) {
    return markFailed(meetingId, "ANTHROPIC_API_KEY is not configured.");
  }

  // `meetings` is company-os's table, so the read goes through its door and the
  // row shape is stated here rather than inferred from the column list.
  // The two sources whose transcript the app itself stores in call_transcripts:
  // the notes upload, and a pasted Lark Minutes link (Z.5).
  const { data: meetingRow, error } = await selectMeetings("id, title, attendees, started_at, call_transcripts(transcript)")
    .eq("id", meetingId)
    .in("source", SUMMARISED_SOURCES)
    .maybeSingle();
  if (error || !meetingRow) return markFailed(meetingId, error?.message ?? "Meeting not found.");
  const meeting = meetingRow as {
    id: string;
    title: string | null;
    attendees: string[] | null;
    started_at: string | null;
    call_transcripts: { transcript: string | null }[] | { transcript: string | null } | null;
  };

  const ct = meeting.call_transcripts as
    | { transcript: string | null }[]
    | { transcript: string | null }
    | null;
  const rawTranscript = (Array.isArray(ct) ? ct[0]?.transcript : ct?.transcript) ?? "";
  const transcript = rawTranscript.slice(0, MAX_TRANSCRIPT_CHARS);
  if (!transcript.trim()) return markFailed(meetingId, "Transcript is empty.");

  const response = await llm.messages.create({
    model: MODEL,
    max_tokens: 2000,
    prompt: MEETING_SUMMARY_PROMPT,
    system: MEETING_SUMMARY_PROMPT.system,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: fillPrompt(MEETING_SUMMARY_PROMPT.user, { transcript }) }],
  });

  const out = readStructuredOutput(
    "meeting-summary",
    MODEL,
    response,
    meetingSummaryOutput,
    "The model declined to summarize this transcript.",
  );
  if (!out.ok) return markFailed(meetingId, out.error);

  const parsed = out.data;
  if (!parsed.summary_markdown?.trim()) {
    return markFailed(meetingId, "Model output was missing the summary.");
  }

  // Coalesce: never overwrite an admin-supplied title/attendees/date. The
  // client-facing summary lives in `summary`; the date in `started_at`.
  const update: Record<string, unknown> = {
    summary: parsed.summary_markdown.trim(),
    summary_encrypted: false,
    ai_model: MODEL,
    ai_status: "ready",
    ai_error: null,
    updated_at: new Date().toISOString(),
  };
  if (!meeting.title?.trim() && parsed.title?.trim()) update.title = parsed.title.trim();
  if ((meeting.attendees ?? []).length === 0 && Array.isArray(parsed.attendees)) {
    const cleaned = parsed.attendees.map((a) => a.trim()).filter(Boolean);
    if (cleaned.length > 0) update.attendees = cleaned;
  }
  if (!meeting.started_at && parsed.meeting_date && ISO_DATE.test(parsed.meeting_date)) {
    update.started_at = parsed.meeting_date;
  }

  const { error: upErr } = await updateMeetings(update).eq("id", meetingId);
  if (upErr) return markFailed(meetingId, upErr.message);

  return { ok: true };
}
