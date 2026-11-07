// Classes in the Admin view (ADR 0016, amended 2026-10-26). A class is one
// lesson: a training on a course (a training_plans row, which the admin pages
// call the course, never the plan). A class has its lesson plan (the session
// blocks and their state) and its recap.
//
// Two reads. classesRead lists every class on a live course, for
// /admin/talent/training, in date order: when, which course and its weekly
// rhythm, how far its lesson plan and
// recap are, whether a video is filed (asked of crm by the page), and how many
// were there. classRead is one class, for /admin/talent/training/classes/[id]:
// the course, the attendees with attended or absent and its source, the lesson
// plan, the recap, and each learner's English evaluation and teacher's
// feedback (./lesson-feedback).
//
// Admins read a class's attendees and attendance since Dave's decision of
// 2026-10-26, so the programme read's three-learner floor does not apply here.
// What neither read carries: a review, a skip reason, a submission, or the
// course's teacher's note on a learner (training_learner_notes). Each shape is
// built field by field, so nothing else of a row reaches it. Reads raise on
// failure (rule 2).
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { NAME_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { PLAN_STATES, type PlanState } from "./session-plan-rules";
import { Rhythm, rhythmLabel } from "./plan-rhythm";
import { RECAP_STATES, Recap, type RecapState, type RecapType } from "./session-recap-rules";
import type { AttendanceSource, AttendanceStatus } from "./training-rules";
import { lessonFeedback, type LessonFeedback } from "./lesson-feedback";

/** A class's lesson plan as a list shows it: none until blocks are drafted or written. */
export type LessonPlanState = "none" | Exclude<PlanState, "none">;

/** How a class's lesson plan reads to an admin. The instructor writes each plan ahead of its class, so "none" is a plan still to come. */
export const LESSON_PLAN_LABEL: Record<LessonPlanState, string> = { none: "No plan yet", drafted: "Drafted", checked: "Checked by the instructor" };

export type ClassRow = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  cancelled: boolean;
  held: boolean;
  courseId: string;
  courseTitle: string;
  courseOpen: boolean;
  /** The course's weekly rhythm, as "Tue, Thu 14:00–15:15". */
  courseRhythm: string;
  lessonPlan: LessonPlanState;
  recapState: RecapState;
  /** Register rows marked attended, and every row still on the register. */
  attended: number;
  registered: number;
};

type ListRow = {
  id: string;
  plan_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  cancelled_at: string | null;
  plan_state: string;
  recap_state: string;
  attendance: { status: string; removed_at: string | null }[];
  blocks: { id: string }[];
};

const planState = (raw: string): PlanState => ((PLAN_STATES as readonly string[]).includes(raw) ? (raw as PlanState) : "none");
const recapState = (raw: string): RecapState => ((RECAP_STATES as readonly string[]).includes(raw) ? (raw as RecapState) : "none");

/** Pure: "none" while the class has no blocks and no drafted plan, else the plan's state. */
export function lessonPlanOf(state: PlanState, blocks: number): LessonPlanState {
  if (state !== "none") return state;
  return blocks > 0 ? "drafted" : "none";
}

/** Every class on a live course (an archived course's are not read), in date order. */
export async function classesRead(now: Date): Promise<ClassRow[]> {
  const courses = mustRows(await companyOs.from("training_plans").select("id, title, open_to_learners, rhythm").is("archived_at", null).limit(200), "[training] admin courses") as { id: string; title: string; open_to_learners: boolean; rhythm: unknown }[];
  if (courses.length === 0) return [];
  const byId = new Map(courses.map((c) => [c.id, c]));
  const rows = mustRows(
    await companyOs
      .from("trainings")
      .select("id, plan_id, title, starts_at, ends_at, cancelled_at, plan_state, recap_state, attendance:training_attendance(status, removed_at), blocks:training_session_blocks(id)")
      .in("plan_id", [...byId.keys()])
      .eq("self_logged", false)
      .order("starts_at")
      .limit(2000),
    "[training] admin classes",
  ) as unknown as ListRow[];
  const rhythms = new Map(courses.map((c) => {
    const r = Rhythm.safeParse(c.rhythm);
    return [c.id, r.success ? rhythmLabel(r.data) : "No rhythm set"];
  }));
  return rows.map((s) => {
    const course = byId.get(s.plan_id);
    const onRegister = s.attendance.filter((a) => a.removed_at === null);
    const cancelled = s.cancelled_at !== null;
    return {
      id: s.id,
      title: s.title,
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      cancelled,
      held: !cancelled && new Date(s.starts_at).getTime() <= now.getTime(),
      courseId: s.plan_id,
      courseTitle: course?.title ?? "A course",
      courseOpen: course?.open_to_learners ?? false,
      courseRhythm: rhythms.get(s.plan_id) ?? "No rhythm set",
      lessonPlan: lessonPlanOf(planState(s.plan_state), s.blocks.length),
      recapState: recapState(s.recap_state),
      attended: onRegister.filter((a) => a.status === "attended").length,
      registered: onRegister.length,
    };
  });
}

export type ClassAttendee = { personId: string; name: string; status: AttendanceStatus; source: AttendanceSource };
export type ClassBlock = { side: "presentation" | "reactive"; minutes: number; text: string };

export type AdminClass = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  cancelled: boolean;
  held: boolean;
  courseId: string;
  courseTitle: string;
  courseOpen: boolean;
  organiserName: string;
  attendees: ClassAttendee[];
  lessonPlan: LessonPlanState;
  blocks: ClassBlock[];
  recapState: RecapState;
  recap: RecapType | null;
  feedback: LessonFeedback[];
};

type OneRow = {
  id: string;
  plan_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  cancelled_at: string | null;
  plan_state: string;
  recap_state: string;
  recap: unknown;
  course: { title: string; open_to_learners: boolean } | null;
  organiser: NamedPerson | null;
  attendance: { person_id: string; status: AttendanceStatus; source: AttendanceSource; removed_at: string | null; person: NamedPerson | null }[];
  blocks: { position: number; side: "presentation" | "reactive"; minutes: number; text: string | null; exercise: { title: string } | null }[];
};

/** One class on a course, for the Admin view; null when there is none or it is not on a course. */
export async function classRead(trainingId: string, now: Date): Promise<AdminClass | null> {
  const rows = mustRows(
    await companyOs
      .from("trainings")
      .select(
        `id, plan_id, title, starts_at, ends_at, cancelled_at, plan_state, recap_state, recap, course:training_plans(title, open_to_learners), organiser:people!trainings_organiser_id_fkey(${NAME_COLUMNS}), attendance:training_attendance(person_id, status, source, removed_at, person:people!training_attendance_person_id_fkey(${NAME_COLUMNS})), blocks:training_session_blocks(position, side, minutes, text, exercise:training_exercises(title))`,
      )
      .eq("id", trainingId)
      .not("plan_id", "is", null)
      .eq("self_logged", false)
      .limit(1),
    "[training] admin class",
  ) as unknown as OneRow[];
  const s = rows[0];
  if (!s || !s.plan_id) return null;
  const recap = Recap.safeParse(s.recap);
  const blocks = [...s.blocks].sort((a, b) => a.position - b.position).map((b) => ({ side: b.side, minutes: b.minutes, text: b.exercise?.title ?? b.text ?? "A block" }));
  const cancelled = s.cancelled_at !== null;
  return {
    id: s.id,
    title: s.title,
    startsAt: s.starts_at,
    endsAt: s.ends_at,
    cancelled,
    held: !cancelled && new Date(s.starts_at).getTime() <= now.getTime(),
    courseId: s.plan_id,
    courseTitle: s.course?.title ?? "A course",
    courseOpen: s.course?.open_to_learners ?? false,
    organiserName: s.organiser ? personName(s.organiser) : "Someone",
    attendees: s.attendance
      .filter((a) => a.removed_at === null)
      // A skip is the member's own word and honesty data (ADR 0016): an admin
      // reads it as absent, never as a skip.
      .map((a) => ({ personId: a.person_id, name: a.person ? personName(a.person) : "Someone", status: a.status === "skipped" ? ("absent" as const) : a.status, source: a.source }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    lessonPlan: lessonPlanOf(planState(s.plan_state), blocks.length),
    blocks,
    recapState: recapState(s.recap_state),
    recap: recap.success ? recap.data : null,
    feedback: await lessonFeedback(s.id),
  };
}
