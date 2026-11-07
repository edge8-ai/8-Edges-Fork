"use server";

// The exercise library's actions (English Program PR 2): add, change and retire
// an exercise, split a pasted document into drafts, and confirm the ticked
// rows. Each asks for training.organise first; the library is shared by every
// organiser, so no row filter beyond the atom. Each write is audited.
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/kernel/data/result";
import {
  ConfirmDraftsInput,
  ExerciseInput,
  addExercise,
  confirmExerciseDrafts,
  retireExercise,
  splitDocumentIntoExercises,
  updateExercise,
  type ImportResult,
} from "@/entities/training/lib/exercises";

const refresh = () => revalidatePath("/team/training/exercises");

export async function addExerciseAction(input: unknown): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const parsed = ExerciseInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const res = await addExercise(actor.personId, parsed.data);
  if (!res.ok) return res;
  await recordAudit({ table: "training_exercises", recordId: "new", operation: "insert", actor: access.user.email, newData: { title: parsed.data.title } });
  refresh();
  return { ok: true };
}

export async function updateExerciseAction(exerciseId: string, input: unknown): Promise<Result> {
  const access = await requirePermission("training.organise");
  await requireTeamMember();
  const parsed = ExerciseInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const id = String(exerciseId ?? "");
  const res = await updateExercise(id, parsed.data);
  if (!res.ok) return res;
  await recordAudit({ table: "training_exercises", recordId: id, operation: "update", actor: access.user.email, newData: { title: parsed.data.title } });
  refresh();
  return { ok: true };
}

export async function retireExerciseAction(exerciseId: string): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const id = String(exerciseId ?? "");
  const res = await retireExercise(actor.personId, id, new Date());
  if (!res.ok) return res;
  await recordAudit({ table: "training_exercises", recordId: id, operation: "update", actor: access.user.email, context: { action: "retire" } });
  refresh();
  return { ok: true };
}

const SplitInput = z.object({ document: z.string().min(1, "Paste the document first.").max(400_000, "That document is too long."), planId: z.string().uuid().nullable() });

/** Claude's draft rows from a pasted document; written nowhere until confirmed. */
export async function splitDocumentAction(input: unknown): Promise<ImportResult> {
  await requirePermission("training.organise");
  await requireTeamMember();
  const parsed = SplitInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  return splitDocumentIntoExercises(parsed.data.document, parsed.data.planId);
}

export async function confirmDraftsAction(input: unknown): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const parsed = ConfirmDraftsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const res = await confirmExerciseDrafts(actor.personId, parsed.data.drafts);
  if (!res.ok) return res;
  await recordAudit({ table: "training_exercises", recordId: "import", operation: "insert", actor: access.user.email, context: { action: "import", added: res.added } });
  refresh();
  return { ok: true };
}
