// A plan's programme philosophy (TR.5, English Program PR 1): the brief every
// prep draft and recap reads first, and the learners see read-only. Seeded once
// by Claude from a pasted conversation transcript, returned as a draft the
// organiser confirms, then edited by hand. Nothing is written until the
// organiser saves.
import { z } from "zod/v4";
import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import type { AiDataClass } from "@/kernel/ai/routing";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import type { Result } from "@/kernel/data/result";
import { PHILOSOPHY_PROMPT } from "./philosophy.prompt";

export const PHILOSOPHY_SITE = "training-philosophy";
// A conversation about how a programme is taught: internal business content,
// no one person's record, so class C.
export const PHILOSOPHY_CLASS: AiDataClass = "C";

const Line = z.string().trim().min(1).max(2000);
const SIDES = ["presentation", "reactive"] as const;

/**
 * The brief's shape as the model is asked for it: no numeric or count bounds,
 * which the structured-output API refuses (kernel/ai/response.ts), only the
 * descriptions the model reads. The bounds are on Philosophy below, checked
 * after the call.
 */
const PhilosophyOutput = z.object({
  purpose: z.string().describe("What the programme is for, in one or two sentences."),
  halves: z.object({
    presentation: z.string().describe("What the presentation half covers: the things learners must have ready."),
    reactive: z.string().describe("What the reactive half covers: what can only be practised live."),
    split: z.number().int().describe("The presentation half's share of each session, in percent of minutes, 0 to 100."),
  }),
  group_for: z.string().describe("What group sessions are for."),
  one_on_one_for: z.string().describe("What one-on-one sessions are for."),
  pressure_rule: z.string().describe("How much pressure, and from when."),
  homework_rule: z.string().describe("What homework is and how it comes back."),
  good_looks_like: z
    .array(z.object({ line: z.string().describe("One observable behaviour."), side: z.enum(SIDES) }))
    .describe("What good looks like, one behaviour per line, each on the side it belongs to; at most twenty."),
  source: z.string().describe("Where the brief came from: who spoke and when."),
});

/** The brief, as the table stores it (training_plans.philosophy): every field written, the split a percentage, at most twenty lines. */
export const Philosophy = z.object({
  purpose: Line,
  halves: z.object({ presentation: Line, reactive: Line, split: z.number().int().min(0).max(100) }),
  group_for: Line,
  one_on_one_for: Line,
  pressure_rule: Line,
  homework_rule: Line,
  // A refine rather than .max: the array-bound scan in campaigns/lib/writer/schemas.test.ts reads every file that derives a model schema.
  good_looks_like: z.array(z.object({ line: Line, side: z.enum(SIDES) })).refine((lines) => lines.length <= 20, "At most twenty lines."),
  source: Line,
});
export type PhilosophyType = z.infer<typeof Philosophy>;

const PHILOSOPHY_SCHEMA = jsonSchemaFor(PhilosophyOutput);
const MAX_TRANSCRIPT_CHARS = 150_000;

export type SeedResult = { ok: true; draft: PhilosophyType } | { ok: false; error: string };

/** One model call over the transcript, returned as a draft and written nowhere. Never throws. */
export async function seedPhilosophyFromTranscript(title: string, transcript: string): Promise<SeedResult> {
  const text = transcript.slice(0, MAX_TRANSCRIPT_CHARS);
  if (!text.trim()) return { ok: false, error: "Paste the transcript first." };
  const ai = aiSite({ site: PHILOSOPHY_SITE, dataClass: PHILOSOPHY_CLASS, tier: "standard" });
  const client = ai.clientIfConfigured();
  if (!client) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };
  try {
    const response = await client.messages.create({
      prompt: PHILOSOPHY_PROMPT,
      model: ai.model,
      max_tokens: 3000,
      system: PHILOSOPHY_PROMPT.system,
      output_config: { effort: "medium", format: { type: "json_schema", schema: PHILOSOPHY_SCHEMA } },
      messages: [{ role: "user", content: fillPrompt(PHILOSOPHY_PROMPT.user, { title, transcript: text }) }],
    });
    const out = readStructuredOutput(PHILOSOPHY_SITE, ai.model, response, PhilosophyOutput, "The model declined this transcript.");
    if (!out.ok) return out;
    // The bounds the request could not carry: a blank field or a split outside 0 to 100 is a draft nobody should save.
    const checked = Philosophy.safeParse(out.data);
    if (!checked.success) return { ok: false, error: `The draft was incomplete: ${zodIssuesToMessage(checked.error.issues)}` };
    return { ok: true, draft: checked.data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Writes the brief on a plan the organiser runs. */
export async function savePhilosophy(organiserId: string, planId: string, philosophy: PhilosophyType, now: Date): Promise<Result> {
  const owned = mustRows(
    await companyOs.from("training_plans").select("id").eq("id", planId).eq("organiser_id", organiserId).is("archived_at", null).limit(1),
    "[training] own plan",
  );
  if (owned.length === 0) return { ok: false, error: "That plan was not found." };
  const { error } = await companyOs
    .from("training_plans")
    .update({ philosophy, philosophy_updated_at: now.toISOString(), philosophy_updated_by: organiserId })
    .eq("id", planId)
    .eq("organiser_id", organiserId);
  if (error) return { ok: false, error: "Could not save the philosophy. Try again." };
  return { ok: true };
}
