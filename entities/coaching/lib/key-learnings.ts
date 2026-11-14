// The key learnings of a group coaching session, written for the learners who
// will read them on the learning platform (Y.93, ADR 0017). Its own gateway
// site and prompt, beside ./group-summary rather than derived from it: the
// summary is internal, names people and carries their blockers, and a learner's
// page must carry none of that.
import { z } from "zod/v4";
import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import type { AiDataClass } from "@/kernel/ai/routing";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { clip } from "./ai-context";
import { KEY_LEARNINGS_PROMPT } from "./key-learnings.prompt";

// The prompt in ./key-learnings.prompt is named after this site; the gateway
// refuses a request whose prompt names another.
export const KEY_LEARNINGS_SITE = "coaching-key-learnings";
// A cohort's session: business content about client engineers, class C like
// the summary of the same transcript.
export const KEY_LEARNINGS_CLASS: AiDataClass = "C";

// The same ceiling as the summary: a two-hour session is about 60k characters.
const MAX_TRANSCRIPT_CHARS = 150_000;

// The structured-output API refuses minItems and maxItems, so the count is in
// the prompt and checked after the call (kernel/ai/response.ts).
export const MIN_LEARNINGS = 3;
export const MAX_LEARNINGS = 8;

export const keyLearningsOutput = z.object({
  learnings: z.array(z.string()).describe(
    "Between three and eight key learnings, the most useful first. One sentence each, something a learner can act on, no names.",
  ),
});

export type KeyLearningsResult = { ok: true; items: string[]; model: string } | { ok: false; error: string };

/**
 * Blanks dropped, then the count the prompt asked for, or why the list is
 * unusable. The cleaning is the platform's own rule for this column (its
 * content endpoint strips each item and drops the empty ones), applied here
 * because the write goes to the column directly and never through that endpoint.
 */
export function guardLearnings(items: string[]): { ok: true; items: string[] } | { ok: false; error: string } {
  const cleaned = items.map((s) => s.trim()).filter(Boolean);
  if (cleaned.length < MIN_LEARNINGS) return { ok: false, error: `The model gave ${cleaned.length} learnings; at least ${MIN_LEARNINGS} are needed.` };
  if (cleaned.length > MAX_LEARNINGS) return { ok: false, error: `The model gave ${cleaned.length} learnings; at most ${MAX_LEARNINGS} are allowed.` };
  return { ok: true, items: cleaned };
}

/** One model call over the transcript. Never throws: the caller reports and retries on a later run. */
export async function generateKeyLearnings(transcript: string): Promise<KeyLearningsResult> {
  const ai = aiSite({ site: KEY_LEARNINGS_SITE, dataClass: KEY_LEARNINGS_CLASS, tier: "standard" });
  const anthropic = ai.clientIfConfigured();
  if (!anthropic) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };
  const text = clip(transcript, MAX_TRANSCRIPT_CHARS);
  if (!text.trim()) return { ok: false, error: "Transcript is empty." };
  const model = ai.model;
  try {
    const response = await anthropic.messages.create({
      prompt: KEY_LEARNINGS_PROMPT,
      model,
      max_tokens: 2000,
      system: KEY_LEARNINGS_PROMPT.system,
      output_config: { effort: "medium", format: { type: "json_schema", schema: jsonSchemaFor(keyLearningsOutput) } },
      messages: [{ role: "user", content: fillPrompt(KEY_LEARNINGS_PROMPT.user, { transcript: text }) }],
    });
    const out = readStructuredOutput(KEY_LEARNINGS_SITE, model, response, keyLearningsOutput, "The model declined this transcript.");
    if (!out.ok) return out;
    const guarded = guardLearnings(out.data.learnings);
    if (!guarded.ok) return guarded;
    return { ok: true, items: guarded.items, model };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
