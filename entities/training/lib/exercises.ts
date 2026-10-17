// The exercise library (English Program PR 2): the activities a teacher runs,
// tagged by side and skill, that every session plan draws on. Shared when
// plan_id is null, a plan's own when set. An exercise is retired, never
// deleted, so a session plan that used it keeps it. A pasted document becomes
// draft rows through Claude; nothing is written until the organiser confirms
// the rows they tick.
import { z } from "zod/v4";
import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import type { AiDataClass } from "@/kernel/ai/routing";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { Result } from "@/kernel/data/result";
import { EXERCISE_IMPORT_PROMPT } from "./exercises.prompt";
import { ExerciseInput, SIDES, type Exercise, type ExerciseDraft, type ExerciseInputType, type Side } from "./exercise-rules";

export { ConfirmDraftsInput, ExerciseInput, facets, filterExercises } from "./exercise-rules";

type Row = {
  id: string;
  title: string;
  side: Side;
  skills: string[];
  format: string | null;
  minutes_min: number;
  minutes_max: number;
  instructions: string | null;
  materials_url: string | null;
  homework_able: boolean;
  plan_id: string | null;
  archived_at: string | null;
};

const COLUMNS =
  "id, title, side, skills, format, minutes_min, minutes_max, instructions, materials_url, homework_able, plan_id, archived_at";

function view(r: Row): Exercise {
  return {
    id: r.id,
    title: r.title,
    side: r.side,
    skills: r.skills,
    format: r.format,
    minutesMin: r.minutes_min,
    minutesMax: r.minutes_max,
    instructions: r.instructions,
    materialsUrl: r.materials_url,
    homeworkAble: r.homework_able,
    planId: r.plan_id,
    archived: r.archived_at !== null,
  };
}

/** The whole library, live first then retired, each by title. The page filters from here. */
export async function listExercises(
  opts: { withRetired?: boolean } = {},
): Promise<Exercise[]> {
  let q = companyOs
    .from("training_exercises")
    .select(COLUMNS)
    .order("title")
    .limit(1000);
  if (!opts.withRetired) q = q.is("archived_at", null);
  const rows = mustRows(await q, "[training] exercises") as unknown as Row[];
  return rows.map(view);
}

function rowOf(personId: string, e: ExerciseInputType) {
  return {
    title: e.title,
    side: e.side,
    skills: e.skills,
    format: e.format,
    minutes_min: e.minutesMin,
    minutes_max: e.minutesMax,
    instructions: e.instructions,
    materials_url: e.materialsUrl,
    homework_able: e.homeworkAble,
    plan_id: e.planId,
    created_by: personId,
  };
}

export async function addExercise(
  personId: string,
  input: ExerciseInputType,
): Promise<Result> {
  const { error } = await companyOs
    .from("training_exercises")
    .insert(rowOf(personId, input));
  if (error)
    return { ok: false, error: "Could not add the exercise. Try again." };
  return { ok: true };
}

export async function updateExercise(
  exerciseId: string,
  input: ExerciseInputType,
): Promise<Result> {
  const { created_by: _by, ...patch } = rowOf("", input);
  const { error } = await companyOs
    .from("training_exercises")
    .update(patch)
    .eq("id", exerciseId)
    .is("archived_at", null);
  if (error)
    return { ok: false, error: "Could not save the exercise. Try again." };
  return { ok: true };
}

/** Retires an exercise: session plans that used it keep it, new ones cannot pick it. */
export async function retireExercise(
  personId: string,
  exerciseId: string,
  now: Date,
): Promise<Result> {
  const { error } = await companyOs
    .from("training_exercises")
    .update({ archived_at: now.toISOString(), archived_by: personId })
    .eq("id", exerciseId)
    .is("archived_at", null);
  if (error) return { ok: false, error: "Could not retire it. Try again." };
  return { ok: true };
}

/** Writes exactly the rows the organiser ticked, in one insert. */
export async function confirmExerciseDrafts(
  personId: string,
  drafts: ExerciseInputType[],
): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  const { error } = await companyOs
    .from("training_exercises")
    .insert(drafts.map((d) => rowOf(personId, d)));
  if (error) return { ok: false, error: "Could not add the rows. Try again." };
  return { ok: true, added: drafts.length };
}

export const EXERCISE_IMPORT_SITE = "training-exercise-import";
// A teacher's own classroom material: internal business content, class C.
export const EXERCISE_IMPORT_CLASS: AiDataClass = "C";

// No numeric or count bounds here, which the structured-output API refuses
// (kernel/ai/response.ts); ExerciseInput holds them and runs after the call.
const ImportOutput = z.object({
  exercises: z
    .array(
      z.object({
        title: z.string().describe("A short title for the activity."),
        side: z.enum(SIDES),
        skills: z.array(z.string()).describe("A few lower-case skill tags."),
        format: z
          .string()
          .describe(
            "drill, roleplay, pair, solo, live, writing, or the document's own word; empty if unclear.",
          ),
        minutes_min: z
          .number()
          .int()
          .describe("The shortest it takes, in minutes."),
        minutes_max: z
          .number()
          .int()
          .describe("The longest it takes, in minutes; at least minutes_min."),
        instructions: z
          .string()
          .describe(
            "What the teacher says and watches for, in the document's words.",
          ),
        materials_url: z
          .string()
          .describe("A link the document gives for it; empty if none."),
        homework_able: z
          .boolean()
          .describe("Whether it could be set as homework."),
      }),
    )
    .describe("One per activity in the document, in the document's order."),
});

export type ImportResult =
  { ok: true; drafts: ExerciseDraft[] } | { ok: false; error: string };

const MAX_DOC_CHARS = 150_000;

/** One model call over the pasted document, returned as drafts and written nowhere. Never throws. */
export async function splitDocumentIntoExercises(
  document: string,
  planId: string | null,
): Promise<ImportResult> {
  const text = document.slice(0, MAX_DOC_CHARS);
  if (!text.trim()) return { ok: false, error: "Paste the document first." };
  const ai = aiSite({
    site: EXERCISE_IMPORT_SITE,
    dataClass: EXERCISE_IMPORT_CLASS,
    tier: "standard",
  });
  const client = ai.clientIfConfigured();
  if (!client)
    return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };
  try {
    const response = await client.messages.create({
      prompt: EXERCISE_IMPORT_PROMPT,
      model: ai.model,
      max_tokens: 8000,
      system: EXERCISE_IMPORT_PROMPT.system,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: jsonSchemaFor(ImportOutput) },
      },
      messages: [
        {
          role: "user",
          content: fillPrompt(EXERCISE_IMPORT_PROMPT.user, { document: text }),
        },
      ],
    });
    const out = readStructuredOutput(
      EXERCISE_IMPORT_SITE,
      ai.model,
      response,
      ImportOutput,
      "The model declined this document.",
    );
    if (!out.ok) return out;
    // Each row is checked as the form would check it; a row the model got wrong is dropped, not saved.
    const drafts: ExerciseDraft[] = [];
    for (const e of out.data.exercises) {
      const parsed = ExerciseInput.safeParse({
        title: e.title,
        side: e.side,
        skills: e.skills.slice(0, 12),
        format: e.format,
        minutesMin: Math.max(1, e.minutes_min),
        minutesMax: Math.max(1, e.minutes_min, e.minutes_max),
        instructions: e.instructions,
        materialsUrl: e.materials_url,
        homeworkAble: e.homework_able,
        planId,
      });
      if (parsed.success) drafts.push({ ...parsed.data, keep: true });
    }
    if (drafts.length === 0)
      return { ok: false, error: "No activities were found in the document." };
    return { ok: true, drafts };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
