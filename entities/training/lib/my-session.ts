// The learner's own view of a taught session and of their programme (English
// Program PR 8). A session the reader is not on reads as not found. What they
// see is theirs alone: their attendance row with its source, their recap line
// and what the class covered once published, the materials, the homework and
// their submission. No other learner's line, ever (ADR 0016).
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { personName, NAME_COLUMNS, type NamedPerson } from "@/kernel/config/people-name";
import type { Assignment, Submission } from "./assignments";
import type { SubmissionKind } from "./assignment-rules";
import { PLAN_STATES, type PlanState } from "./session-plan-rules";
import { RECAP_STATES, Recap, type RecapState } from "./session-recap-rules";
import type { AttendanceSource, AttendanceStatus } from "./training-rules";

export type MySession = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  planId: string | null;
  planTitle: string | null;
  teacherName: string;
  with: string[];
  attendance: { attendanceId: string; status: AttendanceStatus; source: AttendanceSource };
  planState: PlanState;
  blocks: { side: string; minutes: number; label: string }[];
  materials: { label: string; url: string }[];
  recap: { covered: string; mine: string | null; homeworkSuggestion: string } | null;
  recapState: RecapState;
  homework: { assignment: Assignment; submission: Submission | null } | null;
};

type Row = {
  id: string;
  status: AttendanceStatus;
  source: AttendanceSource;
  training: {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string;
    cancelled_at: string | null;
    plan_id: string | null;
    plan_state: string;
    materials: unknown;
    recap: unknown;
    recap_state: string;
    plan: { title: string } | null;
    organiser: NamedPerson | null;
    attendance: { person_id: string; removed_at: string | null; person: NamedPerson | null }[];
    blocks: { position: number; side: string; minutes: number; text: string | null; exercise: { title: string } | null }[];
    assignments: { id: string; training_id: string; due_at: string; prompt: string; accepts: SubmissionKind[]; archived_at: string | null }[];
  } | null;
};

const COLUMNS = `id, status, source, training:trainings!inner(id, title, starts_at, ends_at, cancelled_at, plan_id, plan_state, materials, recap, recap_state, plan:training_plans(title), organiser:people!trainings_organiser_id_fkey(${NAME_COLUMNS}), attendance:training_attendance(person_id, removed_at, person:people!training_attendance_person_id_fkey(${NAME_COLUMNS})), blocks:training_session_blocks(position, side, minutes, text, exercise:training_exercises(title)), assignments:training_assignments(id, training_id, due_at, prompt, accepts, archived_at))`;

function view(r: Row, personId: string, submission: Submission | null): MySession | null {
  const t = r.training;
  if (!t || t.cancelled_at) return null;
  const recapState = (RECAP_STATES as readonly string[]).includes(t.recap_state) ? (t.recap_state as RecapState) : "none";
  const recap = Recap.safeParse(t.recap);
  const live = t.assignments.find((a) => a.archived_at === null);
  const materials = Array.isArray(t.materials) ? (t.materials as { label?: unknown; url?: unknown }[]).flatMap((m) => (typeof m?.url === "string" ? [{ label: String(m.label ?? "Link"), url: m.url }] : [])) : [];
  return {
    id: t.id,
    title: t.title,
    startsAt: t.starts_at,
    endsAt: t.ends_at,
    planId: t.plan_id,
    planTitle: t.plan?.title ?? null,
    teacherName: t.organiser ? personName(t.organiser) : "your teacher",
    with: t.attendance.filter((a) => a.removed_at === null && a.person_id !== personId).map((a) => (a.person ? personName(a.person) : "Someone")).sort(),
    attendance: { attendanceId: r.id, status: r.status, source: r.source },
    planState: (PLAN_STATES as readonly string[]).includes(t.plan_state) ? (t.plan_state as PlanState) : "none",
    blocks: [...t.blocks].sort((a, b) => a.position - b.position).map((b) => ({ side: b.side, minutes: b.minutes, label: b.exercise?.title ?? b.text ?? "" })),
    materials,
    // The recap reaches the learner only once published, and only their own line of it.
    recap: recapState === "published" && recap.success ? { covered: recap.data.covered, mine: recap.data.learners.find((l) => l.person_id === personId)?.md ?? null, homeworkSuggestion: recap.data.homework_suggestion } : null,
    recapState,
    homework: live ? { assignment: { id: live.id, trainingId: live.training_id, dueAt: live.due_at, prompt: live.prompt, accepts: live.accepts }, submission } : null,
  };
}

async function submissionOf(personId: string, assignmentId: string | null): Promise<Submission | null> {
  if (!assignmentId) return null;
  const rows = mustRows(await companyOs.from("training_submissions").select("kind, text, url, storage_path, submitted_at").eq("assignment_id", assignmentId).eq("person_id", personId).limit(1), "[training] my submission") as { kind: SubmissionKind; text: string | null; url: string | null; storage_path: string | null; submitted_at: string }[];
  const s = rows[0];
  return s ? { kind: s.kind, text: s.text, url: s.url, storagePath: s.storage_path, submittedAt: s.submitted_at } : null;
}

/** One session the reader is on; null when they are not, which the page turns into a 404. */
export async function readMySession(personId: string, trainingId: string): Promise<MySession | null> {
  const rows = mustRows(await companyOs.from("training_attendance").select(COLUMNS).eq("person_id", personId).eq("training_id", trainingId).is("removed_at", null).limit(1), "[training] my session") as unknown as Row[];
  const r = rows[0];
  if (!r?.training) return null;
  const live = r.training.assignments.find((a) => a.archived_at === null);
  return view(r, personId, await submissionOf(personId, live?.id ?? null));
}

export type ProgrammeSession = Pick<MySession, "id" | "title" | "startsAt" | "endsAt" | "planTitle" | "teacherName" | "with" | "planState" | "blocks" | "recapState"> & { homeworkDue: string | null };

/** The reader's plan sessions: the next ones and the past ones, for My Training. */
export async function myProgramme(personId: string, now: Date): Promise<{ next: ProgrammeSession[]; past: ProgrammeSession[] }> {
  const rows = mustRows(await companyOs.from("training_attendance").select(COLUMNS).eq("person_id", personId).is("removed_at", null).not("training.plan_id", "is", null).limit(300), "[training] my programme") as unknown as Row[];
  const sessions = rows.flatMap((r) => {
    const v = view(r, personId, null);
    return v ? [{ ...v, homeworkDue: v.homework?.assignment.dueAt ?? null }] : [];
  });
  return splitProgramme(sessions, now);
}

/** Pure: what is next (soonest first, up to three) and what has started (newest first). */
export function splitProgramme<S extends { startsAt: string }>(sessions: S[], now: Date): { next: S[]; past: S[] } {
  const t = now.getTime();
  return {
    next: sessions.filter((s) => new Date(s.startsAt).getTime() > t).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 3),
    past: sessions.filter((s) => new Date(s.startsAt).getTime() <= t).sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
  };
}
