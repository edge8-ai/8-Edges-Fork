"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { toPatch } from "@/kernel/config/patch";
import { type Result } from "@/entities/crm";
import { adminAddGoal, adminDeleteGoal, adminUpdateGoal, type MyGoalInput } from "@/entities/coaching";
import {
  checkInKr as _checkInKr,
  createKr as _createKr,
  createObjective as _createObjective,
  updateKr as _updateKr,
  updateObjective as _updateObjective,
  type KrInput,
  type ObjectiveInput,
} from "../edges/goals/actions";
import { type KrStatus } from "@/entities/org/lib/company/edges-shared";

// Server actions for the admin Company section. Strategy is edited here
// directly (Core Values have their own file, values/actions.ts); individual
// FAST goals delegate to the admin* helpers in lib/coaching/data (which share
// column shaping with the members' own writes).
// Every write is admin-gated and audited, and revalidates both the admin page
// and the company-visible /team page that reads the same row.

// ---- Strategy -----------------------------------------------------------
export async function updateStrategy(id: string, patch: { title?: string; body_md?: string }): Promise<Result> {
  const { user: admin } = await requirePermission("org.company");
  if (patch.title !== undefined && !patch.title.trim()) {
    return { ok: false, error: "The strategy line can't be empty." };
  }
  const updates = { ...toPatch(patch), updated_at: new Date().toISOString() };
  const { error } = await companyOs.from("strategies").update(updates).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "strategies", recordId: id, operation: "update", actor: admin.email, newData: patch });
  revalidatePath("/admin/company/strategy");
  revalidatePath("/admin/edges/goals");
  revalidatePath("/team/strategy");
  return { ok: true };
}

// ---- Individual FAST goals (any member) ---------------------------------
function refreshGoals() {
  revalidatePath("/admin/company/goals");
  revalidatePath("/team/company-goals");
  revalidatePath("/team/my-coaching");
}

export async function addMemberGoal(teamMemberId: string, input: MyGoalInput): Promise<Result> {
  const { user: admin } = await requirePermission("org.company");
  const res = await adminAddGoal(teamMemberId, input);
  if (!res.ok) return res;
  await recordAudit({
    table: "goals",
    recordId: teamMemberId,
    operation: "insert",
    actor: admin.email,
    newData: { title: input.title, for_team_member: teamMemberId },
  });
  refreshGoals();
  return { ok: true };
}

export async function updateMemberGoal(goalId: string, input: MyGoalInput): Promise<Result> {
  const { user: admin } = await requirePermission("org.company");
  const res = await adminUpdateGoal(goalId, input);
  if (!res.ok) return res;
  await recordAudit({
    table: "goals",
    recordId: goalId,
    operation: "update",
    actor: admin.email,
    newData: { title: input.title },
  });
  refreshGoals();
  return { ok: true };
}

export async function deleteMemberGoal(goalId: string): Promise<Result> {
  const { user: admin } = await requirePermission("org.company");
  const res = await adminDeleteGoal(goalId);
  if (!res.ok) return res;
  await recordAudit({ table: "goals", recordId: goalId, operation: "delete", actor: admin.email });
  refreshGoals();
  return { ok: true };
}

// ---- Company objectives + key results -----------------------------------
// Inline editing on /admin/company/goals. The underlying writes (requireAdmin,
// validation, audit) live in the 8 Edges actions; these thin wrappers add the
// company + team revalidation so both surfaces refresh. Objectives here are
// always company-level (the only level in use); the cascade board's deeper
// office/executor levels are unaffected.
function refreshCascade() {
  revalidatePath("/admin/company/goals");
  revalidatePath("/team/company-goals");
  revalidatePath("/admin/edges/goals");
}

export async function createObjective(input: ObjectiveInput): Promise<Result & { id?: string }> {
  const res = await _createObjective(input);
  refreshCascade();
  return res;
}

export async function updateObjective(
  id: string,
  patch: { title?: string; status?: string; brand?: string; owner_agent?: string },
): Promise<Result> {
  const res = await _updateObjective(id, patch);
  refreshCascade();
  return res;
}

export async function createKr(input: KrInput): Promise<Result & { id?: string }> {
  const res = await _createKr(input);
  refreshCascade();
  return res;
}

export async function updateKr(id: string, patch: Partial<Omit<KrInput, "objective_id">>): Promise<Result> {
  const res = await _updateKr(id, patch);
  refreshCascade();
  return res;
}

export async function checkInKr(id: string, input: { current_value: number; status: KrStatus }): Promise<Result> {
  const res = await _checkInKr(id, input);
  refreshCascade();
  return res;
}
