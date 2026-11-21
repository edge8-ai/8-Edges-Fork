"use server";

// The organiser's hand on the weekly recap (English Program PR 9): save edits
// and their own note, send now, or hold with a reason. Asks for
// training.organise first; the lib checks the plan is theirs.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { recordAudit } from "@/kernel/audit/audit";
import { publish } from "@/kernel/events";
import type { Result } from "@/kernel/data/result";
import { WeeklyDraft } from "@/entities/training/lib/weekly-recap-rules";
import { decideWeeklyRecap, editWeeklyRecap } from "@/entities/training/lib/weekly-recap";
import { readPlan } from "@/entities/training/lib/plan-read";

const Week = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const EditInput = z.object({ draft: WeeklyDraft, instructorNote: z.string().trim().max(4000).nullable() });

async function own(planId: string): Promise<{ actorId: string; email: string; title: string; recipientIds: string[] } | null> {
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const plan = await readPlan(actor.personId, planId, new Date());
  return plan ? { actorId: actor.personId, email: access.user.email, title: plan.title, recipientIds: plan.recipients.map((r) => r.personId) } : null;
}

const refresh = (planId: string, week: string) => revalidatePath(`/team/training/plans/${planId}/weekly/${week}`);

export async function editWeeklyRecapAction(planId: string, week: string, input: unknown): Promise<Result> {
  await requirePermission("training.organise");
  const plan = String(planId ?? "");
  const w = Week.safeParse(week);
  const parsed = EditInput.safeParse(input);
  if (!w.success || !parsed.success) return { ok: false, error: parsed.success ? "Pick a week." : zodIssuesToMessage(parsed.error.issues) };
  const me = await own(plan);
  if (!me) return { ok: false, error: "That plan was not found." };
  const res = await editWeeklyRecap(me.actorId, plan, w.data, parsed.data, new Date());
  if (!res.ok) return res;
  await recordAudit({ table: "training_weekly_recaps", recordId: `${plan}:${w.data}`, operation: "update", actor: me.email, context: { action: "edit" } });
  refresh(plan, w.data);
  return { ok: true };
}

export async function sendWeeklyRecapNowAction(planId: string, week: string): Promise<Result> {
  await requirePermission("training.organise");
  const plan = String(planId ?? "");
  const w = Week.safeParse(week);
  if (!w.success) return { ok: false, error: "Pick a week." };
  const me = await own(plan);
  if (!me) return { ok: false, error: "That plan was not found." };
  const res = await decideWeeklyRecap(me.actorId, plan, w.data, { kind: "send-now" }, new Date());
  if (!res.ok) return res;
  await recordAudit({ table: "training_weekly_recaps", recordId: `${plan}:${w.data}`, operation: "update", actor: me.email, context: { action: "send-now" } });
  refresh(plan, w.data);
  return { ok: true };
}

export async function holdWeeklyRecapAction(planId: string, week: string, reason: unknown): Promise<Result> {
  await requirePermission("training.organise");
  const plan = String(planId ?? "");
  const w = Week.safeParse(week);
  const r = z.string().trim().min(1, "Say why.").max(1000).safeParse(reason);
  if (!w.success || !r.success) return { ok: false, error: r.success ? "Pick a week." : zodIssuesToMessage(r.error.issues) };
  const me = await own(plan);
  if (!me) return { ok: false, error: "That plan was not found." };
  const res = await decideWeeklyRecap(me.actorId, plan, w.data, { kind: "hold", reason: r.data }, new Date());
  if (!res.ok) return res;
  await recordAudit({ table: "training_weekly_recaps", recordId: `${plan}:${w.data}`, operation: "update", actor: me.email, context: { action: "hold", reason: r.data } });
  await publish("training.weekly_recap.held", { planId: plan, planTitle: me.title, weekStart: w.data, organiserId: me.actorId, reason: r.data, recipientPersonIds: me.recipientIds });
  refresh(plan, w.data);
  return { ok: true };
}
