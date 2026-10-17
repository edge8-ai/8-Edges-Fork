// What one learner's page shows the organiser (English Program PR 4): their
// attendance on each of the plan's started sessions with its source, and what
// they handed in. Attendance on a taught session is the teacher's register to
// keep (ADR 0016, amended); a skip reason, a review or stars never appear here.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { AttendanceSource, AttendanceStatus } from "./training-rules";
import type { Submission } from "./assignments";
import type { SubmissionKind } from "./assignment-rules";

export type LearnerSession = { trainingId: string; startsAt: string; endsAt: string; status: AttendanceStatus; source: AttendanceSource };
export type LearnerHomework = { assignmentId: string; trainingId: string; dueAt: string; prompt: string; submission: Submission | null };

type AttRow = { training_id: string; status: AttendanceStatus; source: AttendanceSource; training: { starts_at: string; ends_at: string; cancelled_at: string | null; plan_id: string | null } | null };
type AsgRow = { id: string; training_id: string; due_at: string; prompt: string };
type SubRow = { assignment_id: string; kind: SubmissionKind; text: string | null; url: string | null; storage_path: string | null; submitted_at: string };

export async function learnerOnPlan(planId: string, personId: string): Promise<{ sessions: LearnerSession[]; attended: number; homework: LearnerHomework[] }> {
  const now = new Date().toISOString();
  const att = mustRows(
    await companyOs.from("training_attendance").select("training_id, status, source, training:trainings!inner(starts_at, ends_at, cancelled_at, plan_id)").eq("person_id", personId).eq("training.plan_id", planId).is("removed_at", null).is("training.cancelled_at", null).lte("training.starts_at", now).limit(500),
    "[training] learner attendance",
  ) as unknown as AttRow[];
  const sessions = att
    .filter((a) => a.training)
    .map((a) => ({ trainingId: a.training_id, startsAt: a.training!.starts_at, endsAt: a.training!.ends_at, status: a.status, source: a.source }))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const ids = sessions.map((s) => s.trainingId);
  let homework: LearnerHomework[] = [];
  if (ids.length) {
    const asg = mustRows(await companyOs.from("training_assignments").select("id, training_id, due_at, prompt").in("training_id", ids).is("archived_at", null).order("due_at", { ascending: false }).limit(100), "[training] learner assignments") as AsgRow[];
    if (asg.length) {
      const subs = mustRows(await companyOs.from("training_submissions").select("assignment_id, kind, text, url, storage_path, submitted_at").eq("person_id", personId).in("assignment_id", asg.map((a) => a.id)), "[training] learner submissions") as SubRow[];
      const mine = new Map(subs.map((s) => [s.assignment_id, s]));
      homework = asg.map((a) => {
        const s = mine.get(a.id);
        return { assignmentId: a.id, trainingId: a.training_id, dueAt: a.due_at, prompt: a.prompt, submission: s ? { kind: s.kind, text: s.text, url: s.url, storagePath: s.storage_path, submittedAt: s.submitted_at } : null };
      });
    }
  }
  return { sessions, attended: sessions.filter((s) => s.status === "attended").length, homework };
}
