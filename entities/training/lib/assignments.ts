// Homework (English Program PR 4): an assignment set in a session, due by a
// time, taking the kinds of submission it names; and the learner's answer, one
// of four kinds, held in the row or in the private training-uploads bucket. A
// submission is read by the learner and the plan's organiser and nobody else.
import { z } from "zod";
import { companyOs, supabase } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { Result } from "@/kernel/data/result";
import { personName, NAME_COLUMNS, type NamedPerson } from "@/kernel/config/people-name";
import { KINDS, type SubmissionKind } from "./assignment-rules";
import { PLAN_FLAG, hiddenFromLearners, planOpenToLearners, type FlaggedTraining } from "./learner-visibility";


export const AssignmentInput = z.object({
  dueAt: z.string().datetime({ offset: true, message: "Pick a due time." }),
  prompt: z.string().trim().min(1, "Say what to do.").max(2000, "Keep it under 2,000 characters."),
  accepts: z.array(z.enum(KINDS)).min(1, "Accept at least one kind.").transform((k) => [...new Set(k)]),
});
export type AssignmentInputType = z.infer<typeof AssignmentInput>;

/** The learner's answer, one kind with its one value. A file or recording was uploaded first and only its path arrives here. */
export const SubmissionInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("written"), text: z.string().trim().min(1, "Write something.").max(20_000) }),
  z.object({ kind: z.literal("link"), url: z.string().trim().url("Give a full link.").max(500) }),
  z.object({ kind: z.literal("upload"), storagePath: z.string().min(1).max(500) }),
  z.object({ kind: z.literal("recording"), storagePath: z.string().min(1).max(500) }),
]);
export type SubmissionInputType = z.infer<typeof SubmissionInput>;

export const BUCKET = "training-uploads";

export type Assignment = { id: string; trainingId: string; dueAt: string; prompt: string; accepts: SubmissionKind[] };
export type Submission = { kind: SubmissionKind; text: string | null; url: string | null; storagePath: string | null; submittedAt: string };

type AssignmentRow = { id: string; training_id: string; due_at: string; prompt: string; accepts: SubmissionKind[]; archived_at: string | null };
type SubmissionRow = { assignment_id: string; person_id: string; kind: SubmissionKind; text: string | null; url: string | null; storage_path: string | null; submitted_at: string; person?: NamedPerson | null };

const view = (r: AssignmentRow): Assignment => ({ id: r.id, trainingId: r.training_id, dueAt: r.due_at, prompt: r.prompt, accepts: r.accepts });

async function ownSession(organiserId: string, trainingId: string): Promise<{ plan_id: string | null } | null> {
  const rows = mustRows(await companyOs.from("trainings").select("plan_id").eq("id", trainingId).eq("organiser_id", organiserId).eq("self_logged", false).limit(1), "[training] own session") as { plan_id: string | null }[];
  return rows[0] ?? null;
}

/** Sets or replaces the one live assignment of a session. */
export async function setAssignment(organiserId: string, trainingId: string, input: AssignmentInputType, now: Date): Promise<Result> {
  if (!(await ownSession(organiserId, trainingId))) return { ok: false, error: "That session was not found." };
  const { error: retire } = await companyOs.from("training_assignments").update({ archived_at: now.toISOString() }).eq("training_id", trainingId).is("archived_at", null);
  if (retire) return { ok: false, error: "Could not set the homework. Try again." };
  const { error } = await companyOs.from("training_assignments").insert({ training_id: trainingId, due_at: input.dueAt, prompt: input.prompt, accepts: input.accepts, created_by: organiserId });
  if (error) return { ok: false, error: "Could not set the homework. Try again." };
  return { ok: true };
}

export async function withdrawAssignment(organiserId: string, trainingId: string, now: Date): Promise<Result> {
  if (!(await ownSession(organiserId, trainingId))) return { ok: false, error: "That session was not found." };
  const { error } = await companyOs.from("training_assignments").update({ archived_at: now.toISOString() }).eq("training_id", trainingId).is("archived_at", null);
  if (error) return { ok: false, error: "Could not withdraw it. Try again." };
  return { ok: true };
}

/** The session's live assignment with every submission, for the organiser. */
export async function sessionHomework(trainingId: string): Promise<{ assignment: Assignment; submissions: (Submission & { personId: string; name: string })[] } | null> {
  const rows = mustRows(await companyOs.from("training_assignments").select("id, training_id, due_at, prompt, accepts, archived_at").eq("training_id", trainingId).is("archived_at", null).limit(1), "[training] assignment") as AssignmentRow[];
  const a = rows[0];
  if (!a) return null;
  const subs = mustRows(
    await companyOs.from("training_submissions").select(`assignment_id, person_id, kind, text, url, storage_path, submitted_at, person:people!training_submissions_person_id_fkey(${NAME_COLUMNS})`).eq("assignment_id", a.id),
    "[training] submissions",
  ) as unknown as SubmissionRow[];
  return {
    assignment: view(a),
    submissions: subs.map((s) => ({ personId: s.person_id, name: s.person ? personName(s.person) : "Someone", kind: s.kind, text: s.text, url: s.url, storagePath: s.storage_path, submittedAt: s.submitted_at })),
  };
}

export type MyHomework = { assignment: Assignment; sessionTitle: string; submission: Submission | null };

type MyRow = { id: string; training_id: string; due_at: string; prompt: string; accepts: SubmissionKind[]; archived_at: string | null; training: ({ title: string; cancelled_at: string | null } & FlaggedTraining) | null };

/** The learner's homework on sessions they are on, newest due first, with their own submission if any; none from a plan closed to learners. */
export async function myHomework(personId: string): Promise<MyHomework[]> {
  const sessions = mustRows(await companyOs.from("training_attendance").select("training_id").eq("person_id", personId).is("removed_at", null).limit(500), "[training] my sessions") as { training_id: string }[];
  const ids = sessions.map((s) => s.training_id);
  if (ids.length === 0) return [];
  const rows = mustRows(
    await companyOs.from("training_assignments").select(`id, training_id, due_at, prompt, accepts, archived_at, training:trainings(title, cancelled_at, plan_id, ${PLAN_FLAG})`).in("training_id", ids).is("archived_at", null).order("due_at", { ascending: false }).limit(100),
    "[training] my assignments",
  ) as unknown as MyRow[];
  const live = rows.filter((r) => r.training && !r.training.cancelled_at && !hiddenFromLearners(r.training));
  if (live.length === 0) return [];
  const subs = mustRows(
    await companyOs.from("training_submissions").select("assignment_id, person_id, kind, text, url, storage_path, submitted_at").eq("person_id", personId).in("assignment_id", live.map((r) => r.id)),
    "[training] my submissions",
  ) as SubmissionRow[];
  const mine = new Map(subs.map((s) => [s.assignment_id, s]));
  return live.map((r) => {
    const s = mine.get(r.id);
    return { assignment: view(r), sessionTitle: r.training?.title ?? "Session", submission: s ? { kind: s.kind, text: s.text, url: s.url, storagePath: s.storage_path, submittedAt: s.submitted_at } : null };
  });
}

/** Whether this learner is on the assignment's session, and the assignment itself; null on a plan closed to learners, as if it did not exist. */
async function myAssignment(personId: string, assignmentId: string): Promise<{ assignment: Assignment; planId: string | null } | null> {
  const rows = mustRows(
    await companyOs.from("training_assignments").select(`id, training_id, due_at, prompt, accepts, archived_at, training:trainings!inner(plan_id, ${PLAN_FLAG}, attendance:training_attendance!inner(person_id, removed_at))`).eq("id", assignmentId).is("archived_at", null).eq("training.attendance.person_id", personId).is("training.attendance.removed_at", null).limit(1),
    "[training] my assignment",
  ) as unknown as (AssignmentRow & { training: FlaggedTraining | null })[];
  const a = rows[0];
  return a && !(a.training && hiddenFromLearners(a.training)) ? { assignment: view(a), planId: a.training?.plan_id ?? null } : null;
}

function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "file";
}

/** Step 1 of an upload or recording: a signed URL the browser writes one object to, under the learner's own prefix. */
export async function createSignedUpload(personId: string, assignmentId: string, filename: string): Promise<{ ok: true; signedUrl: string; path: string } | { ok: false; error: string }> {
  const mine = await myAssignment(personId, assignmentId);
  if (!mine) return { ok: false, error: "That homework was not found." };
  const path = `plan/${mine.planId ?? "none"}/assignment/${assignmentId}/${personId}/${crypto.randomUUID()}-${safeName(filename)}`;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Could not start the upload." };
  return { ok: true, signedUrl: data.signedUrl, path };
}

/** Step 2, or the whole of a written or link answer: the row. A kind the assignment does not accept is refused; a resubmission replaces. */
export async function recordSubmission(personId: string, assignmentId: string, input: SubmissionInputType, now: Date): Promise<Result> {
  const mine = await myAssignment(personId, assignmentId);
  if (!mine) return { ok: false, error: "That homework was not found." };
  if (!mine.assignment.accepts.includes(input.kind)) return { ok: false, error: `This homework does not take a ${input.kind === "written" ? "written answer" : input.kind}.` };
  // An uploaded path is pinned under the learner's own prefix, so a tampered path can never name someone else's file.
  if ((input.kind === "upload" || input.kind === "recording") && !input.storagePath.startsWith(`plan/${mine.planId ?? "none"}/assignment/${assignmentId}/${personId}/`)) {
    return { ok: false, error: "Invalid upload path." };
  }
  const row = {
    assignment_id: assignmentId,
    person_id: personId,
    kind: input.kind,
    text: input.kind === "written" ? input.text : null,
    url: input.kind === "link" ? input.url : null,
    storage_path: input.kind === "upload" || input.kind === "recording" ? input.storagePath : null,
    updated_at: now.toISOString(),
  };
  const { error } = await companyOs.from("training_submissions").upsert(row, { onConflict: "assignment_id,person_id" });
  if (error) return { ok: false, error: "Could not save the submission. Try again." };
  return { ok: true };
}

/**
 * The learner's own link to a file they uploaded: only under their own prefix,
 * and not while the plan the path names is closed to learners, which reads as
 * a file that does not exist.
 */
export async function signMyDownload(personId: string, storagePath: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const missing = { ok: false as const, error: "That file was not found." };
  if (!storagePath.includes(`/${personId}/`)) return missing;
  const planId = /^plan\/([^/]+)\//.exec(storagePath)?.[1];
  if (planId && planId !== "none" && !(await planOpenToLearners(planId))) return missing;
  return signDownload(storagePath);
}

/** A short-lived link to an uploaded file or recording, for the learner or the organiser who may see it. */
export async function signDownload(storagePath: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 600);
  if (error || !data) return { ok: false, error: "Could not open the file." };
  return { ok: true, url: data.signedUrl };
}
