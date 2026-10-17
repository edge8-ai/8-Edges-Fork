"use server";

// The organiser's actions (TR.2): schedule a training for people, change it
// until it starts, cancel it. Each asks for training.organise first, then checks
// that its reach covers every person named (a manager organises for their own
// team, Admin and the Training organiser role for everyone), and hands the lib
// the organiser's own id, which every write filters on. Each change is audited.
import { revalidatePath } from "next/cache";
import { requirePermission, type RequestAccess } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/kernel/data/result";
import { ScheduleInput, UpdateInput } from "@/entities/training/lib/training-rules";
import { cancelTraining, scheduleTraining, updateTraining } from "@/entities/training/lib/trainings";
import { PlanInput, createPlan } from "@/entities/training/lib/plans";

const PATHS = ["/team/training", "/team/my-training"];
const refresh = () => PATHS.forEach((p) => revalidatePath(p));

/** Whether any person named is outside the organiser's reach. */
function outsideReach(access: RequestAccess, personIds: readonly string[]): boolean {
  return personIds.some((person) => !access.may("training.organise", { person }));
}

export async function scheduleTrainingAction(input: unknown): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const parsed = ScheduleInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  if (outsideReach(access, parsed.data.personIds)) return { ok: false, error: "You can schedule trainings only for your own team." };
  const res = await scheduleTraining(actor.personId, parsed.data, new Date());
  if (!res.ok) return res;
  await recordAudit({ table: "trainings", recordId: res.id, operation: "insert", actor: access.user.email, newData: { ...parsed.data } });
  refresh();
  return { ok: true };
}

export async function updateTrainingAction(trainingId: string, input: unknown): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const parsed = UpdateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  if (parsed.data.personIds && outsideReach(access, parsed.data.personIds)) return { ok: false, error: "You can schedule trainings only for your own team." };
  const id = String(trainingId ?? "");
  const res = await updateTraining(actor.personId, id, parsed.data, new Date());
  if (!res.ok) return res;
  await recordAudit({ table: "trainings", recordId: id, operation: "update", actor: access.user.email, newData: { ...parsed.data } });
  refresh();
  return { ok: true };
}

export async function cancelTrainingAction(trainingId: string): Promise<Result> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const id = String(trainingId ?? "");
  const res = await cancelTraining(actor.personId, id, new Date());
  if (!res.ok) return res;
  await recordAudit({ table: "trainings", recordId: id, operation: "update", actor: access.user.email, context: { action: "cancel" } });
  refresh();
  return { ok: true };
}

/** A new plan (TR.5): its series of trainings is published from its own page. */
export async function createPlanAction(input: unknown): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const parsed = PlanInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const res = await createPlan(actor.personId, parsed.data);
  if (!res.ok) return res;
  await recordAudit({ table: "training_plans", recordId: res.id, operation: "insert", actor: access.user.email, newData: { ...parsed.data } });
  refresh();
  return res;
}
