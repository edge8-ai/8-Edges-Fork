"use server";

// The organiser's actions on one plan (TR.5, English Program PR 1): change it,
// set its roster, publish it to a date, add a session by hand, move or cancel
// one session, retire it, and seed or save its philosophy. Each asks for
// training.organise first, checks the organiser's reach over every person
// named, and hands the lib the organiser's own id, which every write filters
// on. Each change is audited.
import { revalidatePath } from "next/cache";
import { requirePermission, type RequestAccess } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/kernel/data/result";
import { z } from "zod";
import { AddSessionInput, OpenInput, PlanInput, PublishInput, RecipientsInput, RosterInput, addSession, archivePlan, publishPlan, setOpenToLearners, setRecipients, setRoster, updatePlan } from "@/entities/training/lib/plans";
import { Philosophy, savePhilosophy, seedPhilosophyFromTranscript, type PhilosophyType } from "@/entities/training/lib/philosophy";
import { UpdateInput } from "@/entities/training/lib/training-rules";
import { cancelTraining, updateTraining } from "@/entities/training/lib/trainings";

const refresh = (planId: string) => {
  for (const p of ["/team/training", `/team/training/plans/${planId}`, `/team/training/plans/${planId}/philosophy`, "/team/my-training"]) revalidatePath(p);
};

function outsideReach(access: RequestAccess, personIds: readonly string[]): boolean {
  return personIds.some((person) => !access.may("training.organise", { person }));
}

export async function updatePlanAction(planId: string, input: unknown): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const parsed = PlanInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const id = String(planId ?? "");
  const res = await updatePlan(actor.personId, id, parsed.data);
  if (!res.ok) return res;
  await recordAudit({ table: "training_plans", recordId: id, operation: "update", actor: access.user.email, newData: { ...parsed.data } });
  refresh(id);
  return { ok: true };
}

export async function setRosterAction(planId: string, input: unknown): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const parsed = RosterInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  if (outsideReach(access, parsed.data.personIds)) return { ok: false, error: "You can put only your own team on a plan." };
  const id = String(planId ?? "");
  const res = await setRoster(actor.personId, id, parsed.data.personIds, new Date());
  if (!res.ok) return res;
  await recordAudit({ table: "training_plans", recordId: id, operation: "update", actor: access.user.email, context: { action: "roster" }, newData: { ...parsed.data } });
  refresh(id);
  return { ok: true };
}

export async function publishPlanAction(planId: string, input: unknown): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const parsed = PublishInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const id = String(planId ?? "");
  const res = await publishPlan(actor.personId, id, parsed.data.until, new Date());
  if (!res.ok) return res;
  await recordAudit({ table: "training_plans", recordId: id, operation: "update", actor: access.user.email, context: { action: "publish", created: res.created }, newData: { ...parsed.data } });
  refresh(id);
  return { ok: true };
}

export async function addSessionAction(planId: string, input: unknown): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const parsed = AddSessionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const id = String(planId ?? "");
  const res = await addSession(actor.personId, id, parsed.data, new Date());
  if (!res.ok) return res;
  await recordAudit({ table: "trainings", recordId: id, operation: "insert", actor: access.user.email, context: { action: "add-session", planId: id }, newData: { ...parsed.data } });
  refresh(id);
  return { ok: true };
}

/** Moves one session alone, or changes its notes; after it starts only the title and notes. */
export async function moveSessionAction(planId: string, trainingId: string, input: unknown): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const parsed = UpdateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const id = String(trainingId ?? "");
  const res = await updateTraining(actor.personId, id, parsed.data, new Date());
  if (!res.ok) return res;
  await recordAudit({ table: "trainings", recordId: id, operation: "update", actor: access.user.email, newData: { ...parsed.data } });
  refresh(String(planId ?? ""));
  return { ok: true };
}

export async function cancelSessionAction(planId: string, trainingId: string): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const id = String(trainingId ?? "");
  const res = await cancelTraining(actor.personId, id, new Date());
  if (!res.ok) return res;
  await recordAudit({ table: "trainings", recordId: id, operation: "update", actor: access.user.email, context: { action: "cancel" } });
  refresh(String(planId ?? ""));
  return { ok: true };
}

export async function archivePlanAction(planId: string): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const id = String(planId ?? "");
  const res = await archivePlan(actor.personId, id, new Date());
  if (!res.ok) return res;
  await recordAudit({ table: "training_plans", recordId: id, operation: "update", actor: access.user.email, context: { action: "archive" } });
  refresh(id);
  return { ok: true };
}

const SeedInput = z.object({ title: z.string().trim().min(1).max(200), transcript: z.string().min(1, "Paste the transcript first.").max(400_000, "That transcript is too long.") });

/** Claude's draft of the philosophy from a pasted transcript; written nowhere until the organiser saves it. */
export async function seedPhilosophyAction(input: unknown): Promise<{ ok: true; draft: PhilosophyType } | { ok: false; error: string }> {
  await requirePermission("training.organise");
  await requireTeamMember();
  const parsed = SeedInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  return seedPhilosophyFromTranscript(parsed.data.title, parsed.data.transcript);
}

export async function savePhilosophyAction(planId: string, input: unknown): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const parsed = Philosophy.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const id = String(planId ?? "");
  const res = await savePhilosophy(actor.personId, id, parsed.data, new Date());
  if (!res.ok) return res;
  await recordAudit({ table: "training_plans", recordId: id, operation: "update", actor: access.user.email, context: { action: "philosophy" } });
  refresh(id);
  return { ok: true };
}

/** Opens the plan to its learners or closes it: closed, they see none of it. */
export async function setOpenToLearnersAction(planId: string, input: unknown): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const parsed = OpenInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const id = String(planId ?? "");
  const res = await setOpenToLearners(actor.personId, id, parsed.data.open);
  if (!res.ok) return res;
  await recordAudit({ table: "training_plans", recordId: id, operation: "update", actor: access.user.email, context: { action: parsed.data.open ? "open-to-learners" : "close-to-learners" }, newData: { open_to_learners: parsed.data.open } });
  refresh(id);
  return { ok: true };
}

/** Who receives the weekly recap (PR 9). */
export async function setRecipientsAction(planId: string, input: unknown): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const parsed = RecipientsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const id = String(planId ?? "");
  const res = await setRecipients(actor.personId, id, parsed.data.emails);
  if (!res.ok) return res;
  await recordAudit({ table: "training_plans", recordId: id, operation: "update", actor: access.user.email, context: { action: "recipients", count: parsed.data.emails.length } });
  refresh(id);
  return { ok: true };
}
