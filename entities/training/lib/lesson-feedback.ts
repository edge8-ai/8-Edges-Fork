// A lesson's per-learner feedback (ADR 0016, amended 2026-10-26): on one row
// per learner per lesson, Claude's evaluation of their English
// (./english-evaluation) and the teacher's own feedback, written here. Both
// are read by the lesson's teacher, on their session page, and by admins, on
// the Admin view's lesson page. No learner read selects this table: the
// learner sees neither while the evaluation is tested.
//
// The teacher's write names the feedback's columns only, so it never touches
// an evaluation, and an evaluation never touches it. Reads raise on failure
// (rule 2): a failed read must not look like a lesson with no feedback.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { Result } from "@/kernel/data/result";
import { NAME_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { FEEDBACK_MAX, readEvaluation, type EvaluationType } from "./english-evaluation-rules";


export type LessonFeedback = {
  personId: string;
  name: string;
  evaluation: EvaluationType | null;
  evaluatedAt: string | null;
  feedback: string | null;
  feedbackAt: string | null;
  feedbackByName: string | null;
};

type Row = {
  person_id: string;
  evaluation: unknown;
  evaluated_at: string | null;
  feedback: string | null;
  feedback_at: string | null;
  person: NamedPerson | null;
  author: NamedPerson | null;
};

const COLUMNS = `person_id, evaluation, evaluated_at, feedback, feedback_at, person:people!training_learner_feedback_person_id_fkey(${NAME_COLUMNS}), author:people!training_learner_feedback_feedback_by_fkey(${NAME_COLUMNS})`;

/** Every learner's evaluation and feedback on one lesson, by name. The caller has already decided the reader may see them. */
export async function lessonFeedback(trainingId: string): Promise<LessonFeedback[]> {
  const rows = mustRows(await companyOs.from("training_learner_feedback").select(COLUMNS).eq("training_id", trainingId).limit(200), "[training] lesson feedback") as unknown as Row[];
  return rows
    .map((r) => ({
      personId: r.person_id,
      name: r.person ? personName(r.person) : "A learner",
      evaluation: readEvaluation(r.evaluation),
      evaluatedAt: r.evaluated_at,
      feedback: r.feedback,
      feedbackAt: r.feedback_at,
      feedbackByName: r.author ? personName(r.author) : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The teacher's feedback on one learner for one lesson they organise. The
 * lesson must be theirs and the learner on its register; an empty text clears
 * the feedback. Only the feedback's columns are written.
 */
export async function saveLearnerFeedback(organiserId: string, trainingId: string, personId: string, text: string, now: Date): Promise<Result> {
  const feedback = text.trim();
  if (feedback.length > FEEDBACK_MAX) return { ok: false, error: `Keep the feedback under ${FEEDBACK_MAX} characters.` };
  const lessons = mustRows(await companyOs.from("trainings").select("id").eq("id", trainingId).eq("organiser_id", organiserId).eq("self_logged", false).limit(1), "[training] feedback lesson");
  if (lessons.length === 0) return { ok: false, error: "That session was not found." };
  const onRegister = mustRows(await companyOs.from("training_attendance").select("id").eq("training_id", trainingId).eq("person_id", personId).is("removed_at", null).limit(1), "[training] feedback learner");
  if (onRegister.length === 0) return { ok: false, error: "That learner is not on this session." };
  const at = now.toISOString();
  const { error } = await companyOs
    .from("training_learner_feedback")
    .upsert(
      { training_id: trainingId, person_id: personId, feedback: feedback || null, feedback_by: feedback ? organiserId : null, feedback_at: feedback ? at : null, updated_at: at },
      { onConflict: "training_id,person_id" },
    );
  if (error) return { ok: false, error: "Could not save the feedback. Try again." };
  return { ok: true };
}
