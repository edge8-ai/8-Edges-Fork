// Who has handed in the homework due for a session (English Program PR 3):
// each person on the session, and whether they have a submission for every
// assignment on the plan due by the session's start and set in the last two
// weeks. Read by the morning reminder and the session page. Submitted or not
// is what the organiser sees; never the submission's content here.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { personName, NAME_COLUMNS, type NamedPerson } from "@/kernel/config/people-name";

export type HomeworkStanding = { name: string; submitted: boolean };

type AttendanceRow = { person_id: string; person: NamedPerson | null };
type AssignmentRow = { id: string; training: { plan_id: string | null } | null };
type SubmissionRow = { assignment_id: string; person_id: string };

export async function homeworkStanding(planId: string, trainingId: string, startsAt: string): Promise<HomeworkStanding[]> {
  const people = mustRows(
    await companyOs.from("training_attendance").select(`person_id, person:people!training_attendance_person_id_fkey(${NAME_COLUMNS})`).eq("training_id", trainingId).is("removed_at", null),
    "[training] session people",
  ) as unknown as AttendanceRow[];
  const since = new Date(new Date(startsAt).getTime() - 14 * 24 * 60 * 60_000).toISOString();
  const assignments = (
    mustRows(
      await companyOs
        .from("training_assignments")
        .select("id, training:trainings!inner(plan_id)")
        .eq("training.plan_id", planId)
        .is("archived_at", null)
        .lte("due_at", startsAt)
        .gte("created_at", since),
      "[training] assignments due",
    ) as unknown as AssignmentRow[]
  ).map((a) => a.id);
  const done = new Set<string>();
  if (assignments.length) {
    const subs = mustRows(await companyOs.from("training_submissions").select("assignment_id, person_id").in("assignment_id", assignments), "[training] submissions") as SubmissionRow[];
    for (const s of subs) done.add(`${s.assignment_id}:${s.person_id}`);
  }
  return people
    .map((p) => ({ name: p.person ? personName(p.person) : "Someone", submitted: assignments.length > 0 && assignments.every((a) => done.has(`${a}:${p.person_id}`)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
