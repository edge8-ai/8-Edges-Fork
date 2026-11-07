// A lesson's English evaluation (ADR 0016, amended 2026-10-26): Claude reads
// the lesson's transcript and writes, for each learner on the register who
// attended and spoke, a CEFR level with its reason, a short summary, strengths,
// things to improve and examples quoted from the transcript with a better way
// to say them. It is stored on training_learner_feedback, one row per learner
// per lesson, beside the teacher's own feedback, which this module never
// touches. The teacher and admins read it; the learner does not, while the
// evaluation is tested.
//
// Two callers: the session-recap routine, right after it drafts a recap, and
// the organiser's Evaluate English button. A learner who did not speak gets
// no evaluation, an example the transcript does not contain is dropped, and an
// evaluation addressed to anyone else is refused.
import { z } from "zod/v4";
import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import type { AiDataClass } from "@/kernel/ai/routing";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { GREETING_COLUMNS, greetingName, legalName, personName, type GreetedPerson } from "@/kernel/config/people-name";
import { settleEvaluation, whoSpoke, type EvaluationType } from "./english-evaluation-rules";
import { namesFor } from "./transcript-attendance";
import { whenLabel } from "./training-format";
import { ENGLISH_EVALUATION_PROMPT } from "./english-evaluation.prompt";

export const ENGLISH_EVALUATION_SITE = "training-english-evaluation";
// A class transcript about named learners' English: one person's record in
// the teacher's hands, so class S, the official Anthropic API only, as the
// session recap is.
export const ENGLISH_EVALUATION_CLASS: AiDataClass = "S";

const EvaluationOutput = z.object({
  evaluations: z
    .array(
      z.object({
        person_id: z.string().describe("The learner's id from the list."),
        level: z.string().describe("The CEFR level: A1, A2, B1, B2, C1 or C2."),
        level_reason: z.string().describe("One line on why that level."),
        summary: z.string().describe("Two or three sentences on their English in this lesson."),
        strengths: z.array(z.string()).describe("Up to four strengths."),
        improvements: z.array(z.string()).describe("Up to four things to improve."),
        examples: z.array(z.object({ said: z.string().describe("Their words, copied exactly from the transcript."), better: z.string().describe("A better way to say it.") })).describe("Up to five examples."),
      }),
    )
    .describe("One per listed learner."),
});

const MAX_TRANSCRIPT_CHARS = 150_000;

/** A learner on the lesson's register who attended, with every name the transcript may call them. */
export type EvaluationLearner = { id: string; name: string; names: string[] };

export type LearnerEvaluation = { personId: string; evaluation: EvaluationType };

type Drafted = { ok: true; model: string; evaluations: LearnerEvaluation[] } | { ok: false; error: string };

/** One model call over the transcript; each evaluation is checked and returned, written nowhere. Never throws. */
export async function draftEvaluations(input: { title: string; startsAt: string; endsAt: string; transcript: string; learners: readonly EvaluationLearner[] }): Promise<Drafted> {
  const text = input.transcript.slice(0, MAX_TRANSCRIPT_CHARS);
  const spoke = whoSpoke(text, input.learners);
  const speakers = input.learners.filter((l) => spoke.has(l.id));
  const ai = aiSite({ site: ENGLISH_EVALUATION_SITE, dataClass: ENGLISH_EVALUATION_CLASS, tier: "deep" });
  // Nobody on the register spoke: nothing to evaluate, and no call is made.
  if (speakers.length === 0) return { ok: true, model: ai.model, evaluations: [] };
  const client = ai.clientIfConfigured();
  if (!client) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };
  try {
    const response = await client.messages.create({
      prompt: ENGLISH_EVALUATION_PROMPT,
      model: ai.model,
      max_tokens: 8000,
      system: ENGLISH_EVALUATION_PROMPT.system,
      output_config: { effort: "medium", format: { type: "json_schema", schema: jsonSchemaFor(EvaluationOutput) } },
      messages: [
        {
          role: "user",
          content: fillPrompt(ENGLISH_EVALUATION_PROMPT.user, {
            title: input.title,
            when: whenLabel(input.startsAt, input.endsAt),
            learners: speakers.map((l) => `${l.id} · ${l.name} · ${namesFor({ id: l.id, names: l.names }).join(", ")}`).join("; "),
            transcript: text,
          }),
        },
      ],
    });
    const out = readStructuredOutput(ENGLISH_EVALUATION_SITE, ai.model, response, EvaluationOutput, "The model declined this transcript.");
    if (!out.ok) return out;
    return { ok: true, model: ai.model, evaluations: keepEvaluations(out.data.evaluations, speakers.map((s) => s.id), text) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Pure: the model's evaluations that may be stored. One per learner who spoke,
 * the first if it wrote two; none for anybody else; each settled against the
 * transcript (settleEvaluation), and left out when nothing usable remains.
 */
export function keepEvaluations(raw: readonly z.infer<typeof EvaluationOutput>["evaluations"][number][], spokeIds: readonly string[], transcript: string): LearnerEvaluation[] {
  const allowed = new Set(spokeIds);
  const out: LearnerEvaluation[] = [];
  for (const r of raw) {
    if (!allowed.has(r.person_id)) continue;
    allowed.delete(r.person_id);
    const evaluation = settleEvaluation(r, transcript);
    if (evaluation) out.push({ personId: r.person_id, evaluation });
  }
  return out;
}

/**
 * Writes the evaluations, one row per learner per lesson. The upsert names the
 * evaluation's columns only, so on a row the teacher already wrote feedback on
 * the feedback stays as it was.
 */
export async function saveEvaluations(trainingId: string, evaluations: readonly LearnerEvaluation[], model: string, now: Date): Promise<{ ok: true } | { ok: false; error: string }> {
  if (evaluations.length === 0) return { ok: true };
  const at = now.toISOString();
  const { error } = await companyOs.from("training_learner_feedback").upsert(
    evaluations.map((e) => ({ training_id: trainingId, person_id: e.personId, evaluation: e.evaluation, evaluation_model: model, evaluated_at: at, updated_at: at })),
    { onConflict: "training_id,person_id" },
  );
  if (error) return { ok: false, error: `Could not save the evaluations: ${error.message}` };
  return { ok: true };
}

type LessonRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  organiser_id: string;
  attendance: { person_id: string; status: string; removed_at: string | null; person: GreetedPerson | null }[];
};

/**
 * Evaluates one lesson the organiser runs, from its transcript, and stores the
 * result. Who may be evaluated is read from the register: a learner on it who
 * attended, never the organiser. Reads raise on failure (rule 2).
 */
export async function evaluateLesson(organiserId: string, trainingId: string, transcript: string, now: Date): Promise<{ ok: true; evaluated: number } | { ok: false; error: string }> {
  const rows = mustRows(
    await companyOs
      .from("trainings")
      .select(`id, title, starts_at, ends_at, organiser_id, attendance:training_attendance(person_id, status, removed_at, person:people!training_attendance_person_id_fkey(${GREETING_COLUMNS}))`)
      .eq("id", trainingId)
      .eq("organiser_id", organiserId)
      .eq("self_logged", false)
      .limit(1),
    "[training] lesson to evaluate",
  ) as unknown as LessonRow[];
  const lesson = rows[0];
  if (!lesson) return { ok: false, error: "That session was not found." };
  const learners: EvaluationLearner[] = lesson.attendance
    .filter((a) => a.removed_at === null && a.status === "attended" && a.person_id !== lesson.organiser_id)
    .map((a) => ({
      id: a.person_id,
      name: a.person ? personName(a.person) : "A learner",
      // Every name the directory holds for them, as attendance reads them.
      names: a.person ? [personName(a.person, null), legalName(a.person, null), greetingName(a.person, null)].filter((n): n is string => Boolean(n)) : [],
    }));
  if (learners.length === 0) return { ok: true, evaluated: 0 };
  const drafted = await draftEvaluations({ title: lesson.title, startsAt: lesson.starts_at, endsAt: lesson.ends_at, transcript, learners });
  if (!drafted.ok) return drafted;
  const saved = await saveEvaluations(trainingId, drafted.evaluations, drafted.model, now);
  if (!saved.ok) return saved;
  return { ok: true, evaluated: drafted.evaluations.length };
}
