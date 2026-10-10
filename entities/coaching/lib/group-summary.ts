// The actionable summary of a group coaching session (the weekly cohort
// call), written for the two audiences inside Edge8 who act on it: the
// engineers who were coached and the leaders who run the programme. It is the
// app-side twin of scripts/crm/meeting-summarize.mjs, on the shared Anthropic
// client and model registry instead of OpenRouter, so the cron needs no extra
// key. Deliberately NOT the 1-1 summariser in ./ai (coach-voiced, two tiers,
// commitments) and NOT the client-facing meeting summary in the portal.
import { z } from "zod/v4";
import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import type { AiDataClass } from "@/kernel/ai/routing";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { clip } from "./ai-context";
import { GROUP_SUMMARY_PROMPT } from "./group-summary.prompt";

// The prompt in ./group-summary.prompt is named after this site; the gateway
// refuses a request whose prompt names another.
export const GROUP_SUMMARY_SITE = "coaching-group-summary";
// A cohort's session: internal business content about client engineers, not
// one person's review, so class C.
export const GROUP_SUMMARY_CLASS: AiDataClass = "C";

// A two-hour session is about 60k characters; the cap keeps a runaway
// recording from blowing the context, and the tail is what goes.
const MAX_TRANSCRIPT_CHARS = 150_000;

export const groupSummaryOutput = z.object({
  title: z.string().describe("Short and specific, at most eight words, no date and no filler."),
  attendees: z.array(z.string()).describe("Names of the people who spoke or were clearly present. Names only."),
  summary_markdown: z.string().describe(
    "Markdown with ## sections in this order, a section omitted only when empty: 'TL;DR' (one or two sentences); " +
      "'Decisions' (bullets of what was decided or agreed); 'Blockers' (bullets as 'Person: what is blocking them'); " +
      "'For engineers' (concrete next steps and the coaching advice given); " +
      "'For leaders' (themes, risks, anything a leader has to act on or escalate).",
  ),
  action_items: z.array(
    z.object({
      title: z.string().describe("The task in a few words, imperative."),
      owner: z.string().describe("The person responsible as named in the transcript, or 'Unassigned'."),
      detail: z.string().describe("One sentence of context, or an empty string."),
      due_date: z.string().describe("YYYY-MM-DD if a deadline was stated; omit otherwise.").optional(),
    }),
  ).describe("Concrete follow-ups stated or clearly implied. Empty array if none; never manufacture items to fill the list."),
});

export type GroupSummary = z.infer<typeof groupSummaryOutput>;

const GROUP_SUMMARY_SCHEMA = jsonSchemaFor(groupSummaryOutput);

export type GroupSummaryResult = { ok: true; summary: GroupSummary; model: string } | { ok: false; error: string };

/** One model call over the transcript. Never throws: the caller stores the transcript either way. */
export async function summarizeGroupSession(transcript: string): Promise<GroupSummaryResult> {
  // Declared per call, as modelFor was, so the env override is read at call time.
  const ai = aiSite({ site: GROUP_SUMMARY_SITE, dataClass: GROUP_SUMMARY_CLASS, tier: "standard" });
  const anthropic = ai.clientIfConfigured();
  if (!anthropic) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };
  const text = clip(transcript, MAX_TRANSCRIPT_CHARS);
  if (!text.trim()) return { ok: false, error: "Transcript is empty." };
  const model = ai.model;
  try {
    const response = await anthropic.messages.create({
      prompt: GROUP_SUMMARY_PROMPT,
      model,
      max_tokens: 4000,
      system: GROUP_SUMMARY_PROMPT.system,
      output_config: { effort: "medium", format: { type: "json_schema", schema: GROUP_SUMMARY_SCHEMA } },
      messages: [{ role: "user", content: fillPrompt(GROUP_SUMMARY_PROMPT.user, { transcript: text }) }],
    });
    const out = readStructuredOutput(GROUP_SUMMARY_SITE, model, response, groupSummaryOutput, "The model declined this transcript.");
    if (!out.ok) return out;
    if (!out.data.summary_markdown.trim()) return { ok: false, error: "Model output was missing the summary." };
    return { ok: true, summary: out.data, model };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
