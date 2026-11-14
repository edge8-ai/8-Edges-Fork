// Concrete files, not this entity's own door: sprint-extract is re-exported by
// the crm module index, which the door re-exports, so importing the door here
// would make the entity's barrel depend on itself.
import { selectCallTranscripts, selectMeetings } from "./reads";
import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import { SPRINT_EXTRACT_PROMPT } from "./sprint-extract.prompt";
import type { AiDataClass } from "@/kernel/ai/routing";
import { companyOs } from "@/kernel/data/supabase";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { z } from "zod/v4";

// Per-client extraction from a multi-client meeting. The weekly planning/retro
// meeting covers several clients in one transcript; the meeting stays ONE
// record (company_os.meetings + call_transcripts), and the separation happens
// here: given the board's client, pull out only what was said about that
// client. The result is a DRAFT the user reviews in the sprint brief before
// saving — nothing is written by this module.

export const SPRINT_EXTRACT_CLASS: AiDataClass = "C";
const AI = aiSite({ site: "sprint-extract", dataClass: SPRINT_EXTRACT_CLASS, tier: "fast" });
const MODEL = AI.model;

// Transcripts can outgrow the context we want to spend; keep the newest text.
const MAX_TRANSCRIPT_CHARS = 300_000;

export type SprintBriefDraft = {
  goal: string | null;
  focus_improvement: string | null;
  going_well: string | null;
  meeting_summary: string | null;
};

export const sprintBriefOutput = z.object({
  goal: z.string().nullable().describe("The goal set for this client's upcoming sprint, in one or two sentences. null if no goal was discussed for this client."),
  focus_improvement: z.string().nullable().describe("The number one thing the team said it is trying to improve for this client, from the retrospective part of the meeting. null if none was named."),
  going_well: z.string().nullable().describe("A short summary of what is going well for this client, from the retrospective. null if not discussed."),
  meeting_summary: z.string().nullable().describe("A concise summary (3 to 6 sentences) of everything else discussed about this client: decisions, risks, follow-ups. null if the client was not discussed."),
});

const DRAFT_SCHEMA = jsonSchemaFor(sprintBriefOutput);

type Ok = { ok: true; draft: SprintBriefDraft };
type Err = { ok: false; error: string };

export async function extractSprintBrief(meetingId: string, clientName: string): Promise<Ok | Err> {
  try {
    const llm = AI.clientIfConfigured();
    if (!llm) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };

    const [meetingRes, transcriptRes] = await Promise.all([
      companyOs.from("meetings").select("title, started_at").eq("id", meetingId).maybeSingle(),
      companyOs.from("call_transcripts").select("transcript, started_at")
        .eq("meeting_id", meetingId)
        .order("started_at", { ascending: true }),
    ]);
    if (!meetingRes.data) return { ok: false, error: "Meeting not found." };

    const transcript = ((transcriptRes.data ?? []) as { transcript: string | null }[])
      .map((t) => t.transcript ?? "")
      .join("\n\n")
      .trim();
    if (!transcript) {
      return { ok: false, error: "No transcript is synced for this meeting yet. Transcripts sync nightly from Lark Minutes." };
    }
    const clipped = transcript.length > MAX_TRANSCRIPT_CHARS ? transcript.slice(-MAX_TRANSCRIPT_CHARS) : transcript;

    const meeting = meetingRes.data as { title: string | null; started_at: string | null };
    const response = await llm.messages.create({
      model: MODEL,
      max_tokens: 1500,
      prompt: SPRINT_EXTRACT_PROMPT,
      system: SPRINT_EXTRACT_PROMPT.system,
      output_config: { format: { type: "json_schema", schema: DRAFT_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: fillPrompt(SPRINT_EXTRACT_PROMPT.user, {
                title: meeting.title ?? "Untitled",
                date: meeting.started_at ?? "unknown date",
                client: clientName,
                transcript: clipped,
              }),
            },
          ],
        },
      ],
    });

    const out = readStructuredOutput(
      "sprint-extract",
      MODEL,
      response,
      sprintBriefOutput,
      "The model declined to read this transcript.",
    );
    if (!out.ok) return { ok: false, error: out.error };

    const parsed = out.data;
    const clean = (s: string | null) => (typeof s === "string" && s.trim() ? s.trim() : null);
    return {
      ok: true,
      draft: {
        goal: clean(parsed.goal),
        focus_improvement: clean(parsed.focus_improvement),
        going_well: clean(parsed.going_well),
        meeting_summary: clean(parsed.meeting_summary),
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[sprint-extract] meeting ${meetingId} failed:`, msg);
    return { ok: false, error: msg };
  }
}
