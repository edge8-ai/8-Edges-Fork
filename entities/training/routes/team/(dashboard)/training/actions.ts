"use server";

// The organiser's actions (TR.2): schedule a training for people, change it
// until it starts, cancel it. Each asks for training.organise first, then checks
// that its reach covers every person named (a manager organises for their own
// team, Admin and the Training organiser role for everyone), and hands the lib
// the organiser's own id, which every write filters on. Each change is audited.
// Moving and cancelling one training ask for training.host (QS.5b), which
// every organiser holds and a Raid's Host holds through the implied Host role:
// the atom opens the move, mayRunSession keeps a Host to a taught session they
// organise, and the lib's filter on the organiser's own id keeps everyone to a
// training they organise. A Host's move changes the time and nothing else.
import { revalidatePath } from "next/cache";
import { requirePermission, type RequestAccess } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/kernel/data/result";
import { MoveInput, ScheduleInput, UpdateInput } from "@/entities/training/lib/training-rules";
import { cancelTraining, moveTraining, scheduleTraining, updateTraining } from "@/entities/training/lib/trainings";
import { mayRunSession } from "@/entities/training/lib/taught-sessions";
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
  const access = await requirePermission("training.host");
  const actor = await requireTeamMember();
  const id = String(trainingId ?? "");
  if (!(await mayRunSession(access, actor.personId, id))) return { ok: false, error: "That training was not found." };
  if (!access.may("training.organise")) return moveHostedSession(access, actor.personId, id, input);
  const parsed = UpdateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  if (parsed.data.personIds && outsideReach(access, parsed.data.personIds)) return { ok: false, error: "You can schedule trainings only for your own team." };
  const res = await updateTraining(actor.personId, id, parsed.data, new Date());
  if (!res.ok) return res;
  await recordAudit({ table: "trainings", recordId: id, operation: "update", actor: access.user.email, newData: { ...parsed.data } });
  refresh();
  return { ok: true };
}

/**
 * A Raid's Host moves the session they host, and that is all (QS.5b): a title,
 * notes or people sent with the time are refused, not dropped, so a caller
 * learns the move did not carry them. The title is the fire's, and people seat
 * themselves.
 */
async function moveHostedSession(access: RequestAccess, personId: string, id: string, input: unknown): Promise<Result> {
  const sent = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  if ("personIds" in sent) return { ok: false, error: "People take their own seat at a session you host." };
  if ("title" in sent || "notes" in sent) return { ok: false, error: "You can move a session you host, not rename it or change its notes." };
  const parsed = MoveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const res = await moveTraining(personId, id, parsed.data, new Date());
  if (!res.ok) return res;
  await recordAudit({ table: "trainings", recordId: id, operation: "update", actor: access.user.email, newData: { ...parsed.data } });
  refresh();
  return { ok: true };
}

export async function cancelTrainingAction(trainingId: string): Promise<Result> {
  const access = await requirePermission("training.host");
  const actor = await requireTeamMember();
  const id = String(trainingId ?? "");
  if (!(await mayRunSession(access, actor.personId, id))) return { ok: false, error: "That training was not found." };
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
