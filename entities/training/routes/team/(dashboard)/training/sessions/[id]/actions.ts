"use server";

// The organiser's actions on one session's plan (English Program PR 3): save
// the blocks, mark the draft checked, redraft with Claude, attach materials;
// set or withdraw the homework and correct attendance (PR 4).
// Each asks for training.organise first and hands the lib the organiser's own
// id, which every write filters on. Each write is audited.
// Marking the register asks for training.host instead (QS.5b): a Raid's Host
// holds it through the implied Host role, and every organiser holds it too.
// The atom opens the move; mayRunSession keeps a Host to a taught session
// they organise, and the register lets only the session's own
// organiser correct a row on it, so a Host marks their fire and no other.
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/kernel/data/result";
import { BlocksInput, MaterialsInput } from "@/entities/training/lib/session-plan-rules";
import { markChecked, readSessionPlan, saveBlocks, saveMaterials } from "@/entities/training/lib/session-plan";
import { mayRunSession } from "@/entities/training/lib/taught-sessions";
import { draftAndSave } from "@/entities/training/lib/prep-draft";
import { z } from "zod";
import { publish } from "@/kernel/events";
import { AssignmentInput, sessionHomework, setAssignment, signDownload, withdrawAssignment } from "@/entities/training/lib/assignments";
import { organiserCorrects } from "@/entities/training/lib/attendance-word";
import { parseTranscript } from "@/entities/training/lib/transcript-parse";
import { readSessionTranscript, saveTranscriptIn } from "./transcript-in";
import { Recap } from "@/entities/training/lib/session-recap-rules";
import { saveRecap } from "@/entities/training/lib/session-recap";
import { appendToNote } from "@/entities/training/lib/learner-notes";
import { sessionOpenToLearners } from "@/entities/training/lib/learner-visibility";
import { evaluateLesson } from "@/entities/training/lib/english-evaluation";
import { saveLearnerFeedback } from "@/entities/training/lib/lesson-feedback";
import { FEEDBACK_MAX } from "@/entities/training/lib/english-evaluation-rules";


const refresh = (id: string) => {
  revalidatePath(`/team/training/sessions/${id}`);
  revalidatePath("/team/my-training");
};

export async function saveBlocksAction(trainingId: string, input: unknown): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const parsed = BlocksInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const id = String(trainingId ?? "");
  const res = await saveBlocks(actor.personId, id, parsed.data.blocks, "organiser", parsed.data.reasoning ?? null, new Date());
  if (!res.ok) return res;
  await recordAudit({ table: "training_session_blocks", recordId: id, operation: "update", actor: access.user.email, context: { blocks: parsed.data.blocks.length } });
  refresh(id);
  return { ok: true };
}

export async function markCheckedAction(trainingId: string): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const id = String(trainingId ?? "");
  const res = await markChecked(actor.personId, id);
  if (!res.ok) return res;
  await recordAudit({ table: "trainings", recordId: id, operation: "update", actor: access.user.email, context: { action: "plan-checked" } });
  refresh(id);
  return { ok: true };
}

/** Asks Claude for a fresh draft; replaces the blocks and leaves the plan drafted. */
export async function redraftAction(trainingId: string): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const id = String(trainingId ?? "");
  const res = await draftAndSave(actor.personId, id, new Date());
  if (!res.ok) return res;
  await recordAudit({ table: "training_session_blocks", recordId: id, operation: "update", actor: access.user.email, context: { action: "redraft" } });
  refresh(id);
  return { ok: true };
}

export async function saveMaterialsAction(trainingId: string, input: unknown): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const parsed = MaterialsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const id = String(trainingId ?? "");
  const res = await saveMaterials(actor.personId, id, parsed.data.materials);
  if (!res.ok) return res;
  await recordAudit({ table: "trainings", recordId: id, operation: "update", actor: access.user.email, context: { action: "materials", count: parsed.data.materials.length } });
  refresh(id);
  return { ok: true };
}

/** Sets or replaces the session's homework (PR 4); each learner on the session is told. */
export async function setAssignmentAction(trainingId: string, input: unknown): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const parsed = AssignmentInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const id = String(trainingId ?? "");
  const res = await setAssignment(actor.personId, id, parsed.data, new Date());
  if (!res.ok) return res;
  await recordAudit({ table: "training_assignments", recordId: id, operation: "insert", actor: access.user.email, newData: { ...parsed.data } });
  const set = await sessionHomework(id);
  const session = await readSessionPlan(actor.personId, id, new Date());
  // Learners are told only on a plan open to them; a closed plan's homework waits unseen.
  if (set && session && (await sessionOpenToLearners(id))) {
    await publish("training.homework.set", { trainingId: id, assignmentId: set.assignment.id, title: session.title, dueAt: set.assignment.dueAt, personIds: session.people.map((p) => p.id) });
  }
  refresh(id);
  return { ok: true };
}

export async function withdrawAssignmentAction(trainingId: string): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const id = String(trainingId ?? "");
  const res = await withdrawAssignment(actor.personId, id, new Date());
  if (!res.ok) return res;
  await recordAudit({ table: "training_assignments", recordId: id, operation: "update", actor: access.user.email, context: { action: "withdraw" } });
  refresh(id);
  return { ok: true };
}

/** The organiser corrects a learner's attendance on a session they run (PR 4, ADR 0016 amended). */
export async function setAttendanceAction(trainingId: string, personId: string, status: unknown): Promise<Result> {
  const access = await requirePermission("training.host");
  const actor = await requireTeamMember();
  const parsed = z.enum(["attended", "absent"]).safeParse(status);
  if (!parsed.success) return { ok: false, error: "Pick attended or absent." };
  const id = String(trainingId ?? "");
  const person = String(personId ?? "");
  if (!(await mayRunSession(access, actor.personId, id))) return { ok: false, error: "That session was not found." };
  const res = await organiserCorrects(actor.personId, { trainingId: id, personId: person }, parsed.data, new Date());
  if (!res.ok) return res;
  await recordAudit({ table: "training_attendance", recordId: `${id}:${person}`, operation: "update", actor: access.user.email, context: { action: "override", status: parsed.data } });
  refresh(id);
  return { ok: true };
}

/** A short-lived link to a learner's uploaded file, for the organiser. */
export async function openSubmissionAction(storagePath: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requirePermission("training.organise");
  await requireTeamMember();
  return signDownload(String(storagePath ?? ""));
}

const TranscriptInput = z.object({
  text: z.string().min(20, "Paste or upload the transcript first.").max(2_000_000, "That transcript is too long."),
  filename: z.string().max(200).nullable().optional(),
  recordingUrl: z.string().trim().url("Give a full link.").max(500).nullable().optional().or(z.literal("")),
});

/** A transcript pasted or uploaded by hand (PR 6): the same meeting, transcript, association and attendance the pickup writes. */
export async function saveTranscriptAction(trainingId: string, input: unknown): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const parsed = TranscriptInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const id = String(trainingId ?? "");
  const now = new Date();
  const session = await readSessionPlan(actor.personId, id, now);
  if (!session) return { ok: false, error: "That session was not found." };
  if (session.state !== "started") return { ok: false, error: "A transcript belongs to a session that has started." };
  const transcript = parseTranscript(parsed.data.text, parsed.data.filename ?? null);
  if (transcript.length < 20) return { ok: false, error: "The transcript came out empty." };
  const res = await saveTranscriptIn(
    { trainingId: id, organiserId: actor.personId, title: session.title, startsAt: session.startsAt, endsAt: session.endsAt, transcript, externalId: `training:${id}`, recordingUrl: parsed.data.recordingUrl || null },
    now,
  );
  if (!res.ok) return res;
  await recordAudit({ table: "call_transcripts", recordId: res.meetingId, operation: "update", actor: access.user.email, context: { action: "transcript-by-hand", trainingId: id, chars: transcript.length } });
  refresh(id);
  return { ok: true };
}

/** The organiser's edit of the recap, still a draft (PR 7). */
export async function saveRecapAction(trainingId: string, input: unknown): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const parsed = Recap.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const id = String(trainingId ?? "");
  const res = await saveRecap(actor.personId, id, parsed.data, "drafted");
  if (!res.ok) return res;
  await recordAudit({ table: "trainings", recordId: id, operation: "update", actor: access.user.email, context: { action: "recap-edit" } });
  refresh(id);
  return { ok: true };
}

/** Approve and publish: each learner on the recap is told and sees their own line (PR 7). */
export async function publishRecapAction(trainingId: string, input: unknown): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const parsed = Recap.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const id = String(trainingId ?? "");
  const now = new Date();
  const session = await readSessionPlan(actor.personId, id, now);
  if (!session) return { ok: false, error: "That session was not found." };
  const res = await saveRecap(actor.personId, id, parsed.data, "published", now);
  if (!res.ok) return res;
  await recordAudit({ table: "trainings", recordId: id, operation: "update", actor: access.user.email, context: { action: "recap-publish" } });
  // Learners are told only on a plan open to them; on a closed one the recap waits unseen.
  if (await sessionOpenToLearners(id)) {
    await publish("training.recap.published", { trainingId: id, title: session.title, startsAt: session.startsAt, personIds: parsed.data.learners.map((l) => l.person_id), actorPersonId: actor.personId });
  }
  refresh(id);
  return { ok: true };
}

/** Folds a learner's recap line into their living note (PR 7). */
export async function addToNoteAction(planId: string, personId: string, line: string): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const text = String(line ?? "").trim().slice(0, 2000);
  if (!text) return { ok: false, error: "Nothing to add." };
  const plan = String(planId ?? "");
  const person = String(personId ?? "");
  const res = await appendToNote(actor.personId, plan, person, text);
  if (!res.ok) return res;
  await recordAudit({ table: "training_learner_notes", recordId: `${plan}:${person}`, operation: "insert", actor: access.user.email, context: { action: "recap-to-note" } });
  revalidatePath(`/team/training/plans/${plan}/learners/${person}`);
  revalidatePath("/team/my-training");
  return { ok: true };
}

/**
 * Asks Claude to evaluate each learner's English from the lesson's transcript
 * (ADR 0016, amended 2026-10-26), replacing any earlier evaluation. The
 * organiser of this session only: the session read and the evaluation's own
 * read find only a session the reader organises. The teacher's feedback is
 * left as it was.
 */
export async function evaluateEnglishAction(trainingId: string): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const id = String(trainingId ?? "");
  const now = new Date();
  const session = await readSessionPlan(actor.personId, id, now);
  if (!session) return { ok: false, error: "That session was not found." };
  if (session.state !== "started") return { ok: false, error: "A lesson is evaluated once it has been held." };
  const transcript = await readSessionTranscript(id);
  if (!transcript?.transcript) return { ok: false, error: "There is no transcript to evaluate yet." };
  const res = await evaluateLesson(actor.personId, id, transcript.transcript, now);
  if (!res.ok) return res;
  await recordAudit({ table: "training_learner_feedback", recordId: null, operation: "update", actor: access.user.email, context: { action: "evaluate-english", trainingId: id, evaluated: res.evaluated } });
  refresh(id);
  if (res.evaluated === 0) return { ok: false, error: "Nobody on the register spoke in the transcript, so there is nothing to evaluate." };
  return { ok: true };
}

const FeedbackInput = z.string().max(FEEDBACK_MAX, `Keep the feedback under ${FEEDBACK_MAX} characters.`);

/**
 * The teacher's feedback on one learner for this lesson (ADR 0016, amended
 * 2026-10-26). The organiser of this session only, about a learner on its
 * register; the learner does not see it. An empty text clears it.
 */
export async function saveLearnerFeedbackAction(trainingId: string, personId: string, text: unknown): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const parsed = FeedbackInput.safeParse(text);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const id = String(trainingId ?? "");
  const person = String(personId ?? "");
  const res = await saveLearnerFeedback(actor.personId, id, person, parsed.data, new Date());
  if (!res.ok) return res;
  // The text stays out of the audit log: it is about one person, for their teacher and admins only.
  await recordAudit({ table: "training_learner_feedback", recordId: null, operation: "update", actor: access.user.email, context: { action: "teacher-feedback", trainingId: id, personId: person, chars: parsed.data.trim().length } });
  refresh(id);
  return { ok: true };
}
