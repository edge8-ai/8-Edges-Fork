// The session recap (English Program PR 7): Claude writes, from the
// transcript, what the class covered, one line addressed to each learner who
// attended, and a homework suggestion. It waits on the training as drafted
// until the organiser publishes it; then each learner sees their own line and
// nobody else's (ADR 0016). A recap naming a learner who was not there, or a
// figure the inputs never gave it, is refused and nothing is saved.
import { z } from "zod/v4";
import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import type { AiDataClass } from "@/kernel/ai/routing";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { Result } from "@/kernel/data/result";
import { Philosophy } from "./philosophy";
import { readSessionPlan, type SessionView } from "./session-plan";
import { Recap, validateRecap, type RecapState, type RecapType } from "./session-recap-rules";
import { whenLabel } from "./training-format";
import { SESSION_RECAP_PROMPT } from "./session-recap.prompt";

export const SESSION_RECAP_SITE = "training-session-recap";
// A class transcript about named learners' English: one person's record in
// the teacher's hands, so class S, the official Anthropic API only.
export const SESSION_RECAP_CLASS: AiDataClass = "S";

const RecapOutput = z.object({
  covered: z.string().describe("What the class covered, one short paragraph."),
  learners: z.array(z.object({ person_id: z.string().describe("The learner's id from the roster."), md: z.string().describe("The line to that learner, second person.") })).describe("One per learner who attended; none for an absent learner."),
  homework_suggestion: z.string().describe("One homework suggestion for the next session."),
});

const MAX_TRANSCRIPT_CHARS = 150_000;

async function philosophyText(planId: string | null): Promise<string> {
  if (!planId) return "(no programme brief)";
  const rows = mustRows(await companyOs.from("training_plans").select("philosophy").eq("id", planId).limit(1), "[training] plan brief") as { philosophy: unknown }[];
  const p = Philosophy.safeParse(rows[0]?.philosophy);
  if (!p.success) return "(not written yet)";
  const d = p.data;
  return [`Purpose: ${d.purpose}`, `Presentation half: ${d.halves.presentation}`, `Reactive half: ${d.halves.reactive}`, `Pressure: ${d.pressure_rule}`, `Homework: ${d.homework_rule}`, `What good looks like: ${d.good_looks_like.map((l) => `${l.line} (${l.side})`).join("; ")}`].join("\n");
}

/** One model call over the transcript; the draft is validated and returned, written nowhere. Never throws. */
export async function draftRecap(session: SessionView, transcript: string): Promise<{ ok: true; recap: RecapType } | { ok: false; error: string }> {
  const ai = aiSite({ site: SESSION_RECAP_SITE, dataClass: SESSION_RECAP_CLASS, tier: "deep" });
  const client = ai.clientIfConfigured();
  if (!client) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };
  const attended = session.people.filter((p) => p.status === "attended");
  const plan = session.blocks.map((b, i) => `${i + 1}. ${b.side} · ${b.minutes} min · ${b.exerciseTitle ?? b.text}`).join("\n") || "(no plan)";
  const text = transcript.slice(0, MAX_TRANSCRIPT_CHARS);
  try {
    const response = await client.messages.create({
      prompt: SESSION_RECAP_PROMPT,
      model: ai.model,
      max_tokens: 4000,
      system: SESSION_RECAP_PROMPT.system,
      output_config: { effort: "medium", format: { type: "json_schema", schema: jsonSchemaFor(RecapOutput) } },
      messages: [
        {
          role: "user",
          content: fillPrompt(SESSION_RECAP_PROMPT.user, {
            title: session.title,
            when: whenLabel(session.startsAt, session.endsAt),
            roster: session.people.map((p) => `${p.id} · ${p.name} · ${p.status === "attended" ? "yes" : "no"}`).join("; "),
            philosophy: await philosophyText(session.planId),
            plan,
            transcript: text,
          }),
        },
      ],
    });
    const out = readStructuredOutput(SESSION_RECAP_SITE, ai.model, response, RecapOutput, "The model declined this transcript.");
    if (!out.ok) return out;
    const parsed = Recap.safeParse(out.data);
    if (!parsed.success) return { ok: false, error: "The recap came back incomplete." };
    const valid = validateRecap(parsed.data, { attendedIds: attended.map((p) => p.id), sources: [text, plan] });
    if (!valid.ok) return valid;
    return { ok: true, recap: parsed.data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Drafts and saves the recap on the training as drafted, for the routine. */
export async function draftAndSaveRecap(organiserId: string, trainingId: string, transcript: string, now: Date): Promise<Result> {
  const session = await readSessionPlan(organiserId, trainingId, now);
  if (!session) return { ok: false, error: "That session was not found." };
  const drafted = await draftRecap(session, transcript);
  if (!drafted.ok) return drafted;
  return saveRecap(organiserId, trainingId, drafted.recap, "drafted");
}

/** Writes the recap in the given state; the organiser's edit keeps it drafted, Publish moves it on. */
export async function saveRecap(organiserId: string, trainingId: string, recap: RecapType, state: Exclude<RecapState, "none">, now: Date = new Date()): Promise<Result> {
  const patch = state === "published" ? { recap, recap_state: state, recap_published_at: now.toISOString(), recap_published_by: organiserId } : { recap, recap_state: state };
  const { error } = await companyOs.from("trainings").update(patch).eq("id", trainingId).eq("organiser_id", organiserId);
  if (error) return { ok: false, error: "Could not save the recap. Try again." };
  return { ok: true };
}
