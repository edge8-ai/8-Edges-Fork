// A second question for the ladders (LD.7; ADR 0021; the badge catalogue,
// docs/engineering/2026-10-21-ladders-badges.md): what a person did in
// Training, as Training keeps it, for the badges found by doing. The sessions
// they were marked attended at (with each session's organiser, whether it was
// self-logged and whether it was cancelled), the submissions they handed in,
// the reviews they wrote, the recaps they published and the trainings they
// logged themselves. Each row carries its id, which is the witness a badge
// names, and when it happened, which only orders the witnesses.
//
// What is never asked: a review's stars, load, tags or note, and any register
// row that was skipped, absent or removed. A review is read for its id alone;
// that it was written is the act, and what it says belongs to the Host's
// reading of it and nobody else's (ADR 0016).
//
// Nor is anything the learner did on a session of a plan closed to learners
// (learner-visibility): an attendance, a submission or a review there finds no
// badge until the plan opens, since a badge would show the learner a session
// they cannot see. A badge once found is never lost, so closing a plan takes
// nothing back.
//
// Batched by person, chunked to keep each request's URL short, and paged
// because PostgREST answers at most a thousand rows a request.
import { companyOs } from "@/kernel/data/supabase";
import { mustPagesIn } from "@/kernel/data/read";
import { PLAN_FLAG, hiddenFromLearners, type FlaggedTraining } from "./learner-visibility";

/** A session the person was marked attended at, and not removed from. */
export type AttendedFact = { id: string; trainingId: string; organiserId: string; selfLogged: boolean; cancelled: boolean; at: string };

/** A row the person made: a submission, a review, a published recap or a self-logged training. */
export type MadeFact = { id: string; at: string };

export type TrainingFacts = {
  attended: AttendedFact[];
  submissions: MadeFact[];
  reviews: MadeFact[];
  /** Trainings whose recap the person published, not cancelled; the id is the training's. */
  recaps: MadeFact[];
  /** Trainings the person logged themselves, not cancelled; the id is the training's. */
  selfLogged: MadeFact[];
};

type AttendanceRow = { id: string; training_id: string; person_id: string; updated_at: string };
type TrainingRow = { id: string; organiser_id: string; self_logged: boolean; cancelled_at: string | null; recap_published_by: string | null; recap_published_at: string | null; created_at: string } & FlaggedTraining;
type SubmissionRow = { id: string; person_id: string; submitted_at: string; assignment: { training: FlaggedTraining | null } | null };

const TRAINING_COLUMNS = `id, organiser_id, self_logged, cancelled_at, recap_published_by, recap_published_at, created_at, plan_id, ${PLAN_FLAG}`;

/** Each person's Training facts; a person with none gets empty lists. */
export async function trainingFactsOf(personIds: readonly string[]): Promise<Map<string, TrainingFacts>> {
  const out = new Map<string, TrainingFacts>(personIds.map((id) => [id, { attended: [], submissions: [], reviews: [], recaps: [], selfLogged: [] }]));
  if (personIds.length === 0) return out;
  const [attendance, submissions, recaps, selfLogged] = await Promise.all([
    mustPagesIn<AttendanceRow>(personIds, "[training/act-facts] attended", (ids, from, to) =>
      companyOs.from("training_attendance").select("id, training_id, person_id, updated_at").in("person_id", ids).eq("status", "attended").is("removed_at", null).order("id").range(from, to),
    ),
    mustPagesIn<SubmissionRow>(personIds, "[training/act-facts] submissions", (ids, from, to) =>
      companyOs.from("training_submissions").select(`id, person_id, submitted_at, assignment:training_assignments(training:trainings(plan_id, ${PLAN_FLAG}))`).in("person_id", ids).order("id").range(from, to),
    ),
    mustPagesIn<TrainingRow>(personIds, "[training/act-facts] recaps published", (ids, from, to) =>
      companyOs.from("trainings").select(TRAINING_COLUMNS).in("recap_published_by", ids).not("recap_published_at", "is", null).is("cancelled_at", null).order("id").range(from, to),
    ),
    mustPagesIn<TrainingRow>(personIds, "[training/act-facts] self-logged", (ids, from, to) =>
      companyOs.from("trainings").select(TRAINING_COLUMNS).in("organiser_id", ids).eq("self_logged", true).is("cancelled_at", null).order("id").range(from, to),
    ),
  ]);
  const [sessions, reviews] = await Promise.all([
    mustPagesIn<TrainingRow>([...new Set(attendance.map((a) => a.training_id))], "[training/act-facts] sessions attended", (ids, from, to) =>
      companyOs.from("trainings").select(TRAINING_COLUMNS).in("id", ids).order("id").range(from, to),
    ),
    // The review's id and when; never its stars, load, tags or note.
    mustPagesIn<{ id: string; attendance_id: string; created_at: string }>(
      attendance.map((a) => a.id),
      "[training/act-facts] reviews written",
      (ids, from, to) => companyOs.from("training_reviews").select("id, attendance_id, created_at").in("attendance_id", ids).order("id").range(from, to),
    ),
  ]);
  const sessionOf = new Map(sessions.map((s) => [s.id, s]));
  // An attendance on a closed plan's session, and so its review, finds nothing.
  const hidden = (a: AttendanceRow) => {
    const s = sessionOf.get(a.training_id);
    return s !== undefined && hiddenFromLearners(s);
  };
  const personOfAttendance = new Map(attendance.filter((a) => !hidden(a)).map((a) => [a.id, a.person_id]));
  for (const a of attendance) {
    const s = sessionOf.get(a.training_id);
    if (s && !hidden(a)) out.get(a.person_id)?.attended.push({ id: a.id, trainingId: a.training_id, organiserId: s.organiser_id, selfLogged: s.self_logged, cancelled: s.cancelled_at !== null, at: a.updated_at });
  }
  for (const s of submissions) if (!(s.assignment?.training && hiddenFromLearners(s.assignment.training))) out.get(s.person_id)?.submissions.push({ id: s.id, at: s.submitted_at });
  for (const r of reviews) {
    const personId = personOfAttendance.get(r.attendance_id);
    if (personId) out.get(personId)?.reviews.push({ id: r.id, at: r.created_at });
  }
  for (const t of recaps) if (t.recap_published_by) out.get(t.recap_published_by)?.recaps.push({ id: t.id, at: t.recap_published_at ?? t.created_at });
  for (const t of selfLogged) out.get(t.organiser_id)?.selfLogged.push({ id: t.id, at: t.created_at });
  return out;
}
