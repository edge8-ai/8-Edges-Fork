"use server";

// The teacher's note on one learner (English Program PR 4): a new version on
// every save, by the plan's organiser only. Asks for training.organise first;
// the lib checks the plan is theirs. The learner is told in their Inbox.
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { recordAudit } from "@/kernel/audit/audit";
import { publish } from "@/kernel/events";
import type { Result } from "@/kernel/data/result";
import { NoteInput, writeNote } from "@/entities/training/lib/learner-notes";
import { signDownload } from "@/entities/training/lib/assignments";
import { planOpenToLearners } from "@/entities/training/lib/learner-visibility";

export async function writeNoteAction(planId: string, personId: string, planTitle: string, input: unknown): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const parsed = NoteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const plan = String(planId ?? "");
  const person = String(personId ?? "");
  const res = await writeNote(actor.personId, plan, person, parsed.data);
  if (!res.ok) return res;
  await recordAudit({ table: "training_learner_notes", recordId: `${plan}:${person}`, operation: "insert", actor: access.user.email, context: { action: "note" } });
  // The learner is told only on a plan open to them; on a closed one the note waits unseen.
  if (await planOpenToLearners(plan)) {
    await publish("training.note.updated", { planId: plan, planTitle: String(planTitle ?? "the programme"), personId: person, actorPersonId: actor.personId });
  }
  revalidatePath(`/team/training/plans/${plan}/learners/${person}`);
  revalidatePath("/team/my-training");
  return { ok: true };
}

/** A short-lived link to a learner's uploaded file, for the organiser of the plan the submission is on. */
export async function openSubmissionAction(storagePath: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requirePermission("training.organise");
  await requireTeamMember();
  return signDownload(String(storagePath ?? ""));
}
