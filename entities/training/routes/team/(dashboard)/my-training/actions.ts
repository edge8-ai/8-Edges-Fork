"use server";

// The member's own actions on My Training (TR.2, TR.3): saying whether they went,
// reviewing what they went to, and logging a training they took on their own.
// Each asks for training.mine first, then hands the lib the member's own person
// id, which every write filters on.
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import type { Result } from "@/kernel/data/result";
import { AnswerInput, LogInput, ReviewInput } from "@/entities/training/lib/training-rules";
import { logOwnTraining } from "@/entities/training/lib/trainings";
import { memberSays, removeReview, saveReview } from "@/entities/training/lib/attendance-word";
import { z } from "zod";
import { SubmissionInput, createSignedUpload, recordSubmission, signMyDownload } from "@/entities/training/lib/assignments";

const PATH = "/team/my-training";

export async function answerMyTraining(trainingId: string, input: unknown): Promise<Result> {
  await requirePermission("training.mine");
  const actor = await requireTeamMember();
  const parsed = AnswerInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const res = await memberSays({ trainingId: String(trainingId ?? ""), personId: actor.personId }, parsed.data, new Date());
  if (res.ok) revalidatePath(PATH);
  return res;
}

// A review saves on every tap (the design: one tap on a star saves), so these
// two do not revalidate the page: a re-render would move a training out of the
// Cool-down tray while the member is still on it. The tray refreshes the page
// itself when they say Done.
export async function reviewMyTraining(trainingId: string, input: unknown): Promise<Result> {
  await requirePermission("training.mine");
  const actor = await requireTeamMember();
  const parsed = ReviewInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  return saveReview({ trainingId: String(trainingId ?? ""), personId: actor.personId }, parsed.data, new Date());
}

export async function removeMyReview(trainingId: string): Promise<Result> {
  await requirePermission("training.mine");
  const actor = await requireTeamMember();
  return removeReview({ trainingId: String(trainingId ?? ""), personId: actor.personId }, new Date());
}

export async function logMyTraining(input: unknown): Promise<Result> {
  await requirePermission("training.mine");
  const actor = await requireTeamMember();
  const parsed = LogInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const res = await logOwnTraining(actor.personId, parsed.data, new Date());
  if (res.ok) revalidatePath(PATH);
  return res;
}

/** Step 1 of a file or recording submission (PR 4): a signed URL the browser writes to. */
export async function startHomeworkUpload(assignmentId: string, filename: string): Promise<{ ok: true; signedUrl: string; path: string } | { ok: false; error: string }> {
  await requirePermission("training.mine");
  const actor = await requireTeamMember();
  return createSignedUpload(actor.personId, String(assignmentId ?? ""), String(filename ?? "file"));
}

/** The learner's answer to homework on a session they are on (PR 4). */
export async function submitHomework(assignmentId: string, input: unknown): Promise<Result> {
  await requirePermission("training.mine");
  const actor = await requireTeamMember();
  const parsed = SubmissionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const res = await recordSubmission(actor.personId, String(assignmentId ?? ""), parsed.data, new Date());
  if (res.ok) revalidatePath(PATH);
  return res;
}

/** The learner confirms or corrects what the transcript said about them (PR 4, ADR 0016 amended). */
export async function confirmAttendance(trainingId: string, status: unknown): Promise<Result> {
  await requirePermission("training.mine");
  const actor = await requireTeamMember();
  const parsed = z.enum(["attended", "absent"]).safeParse(status);
  if (!parsed.success) return { ok: false, error: "Pick attended or absent." };
  const res = await memberSays({ trainingId: String(trainingId ?? ""), personId: actor.personId }, { answer: parsed.data }, new Date());
  if (res.ok) revalidatePath(PATH);
  return res;
}

/** A short-lived link to the learner's own uploaded file. */
export async function openMySubmission(storagePath: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requirePermission("training.mine");
  const actor = await requireTeamMember();
  // Only under the learner's own prefix, and not on a plan closed to learners.
  return signMyDownload(actor.personId, String(storagePath ?? ""));
}
