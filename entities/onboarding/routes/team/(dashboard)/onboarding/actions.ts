"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getReportingSubtreeIds } from "@/kernel/identity/org-tree";
import { teamUpdateInScope } from "@/entities/team";
import { savePlanLink, uploadPlanDocument, setJourneyStage } from "@/entities/onboarding/lib/cycle";
import type { Result } from "@/kernel/data/result";

// Onboarding-board actions for /team managers. Same discipline as the time-off
// actions: requireTeamMember() plus a server-side ownership check, so a
// client-forged journey or task id for someone outside the manager's reporting
// subtree is a no-op. The board shows the whole subtree (see page.tsx), so the
// write scope is the subtree too, not actor.teamMemberScope.

function refresh() {
  revalidatePath("/team/onboarding");
}

// The plan is the manager's deliverable, so these three are manager-gated even
// though an employee's own journey is technically in their scope. Re-derives
// the journey's owner from the database and checks it against the subtree.
async function requireManagerScope(journeyId: string) {
  const actor = await requireTeamMember();
  if (actor.role !== "manager") return { actor: null, ownerTeamMemberId: null };
  if (!journeyId) return { actor, ownerTeamMemberId: null };
  const { data, error } = await companyOs
    .from("onboarding_plans")
    .select("team_member_id")
    .eq("id", journeyId)
    .maybeSingle();
  if (error) {
    console.error("[team/onboarding] journey lookup failed:", error.message);
    return { actor, ownerTeamMemberId: null };
  }
  const owner = (data as { team_member_id: string | null } | null)?.team_member_id ?? null;
  if (!owner) return { actor, ownerTeamMemberId: null };
  const subtree = await getReportingSubtreeIds(actor.teamMemberId);
  return { actor, ownerTeamMemberId: subtree.includes(owner) ? owner : null };
}

// Add (or replace) the link to a report's onboarding plan.
export async function setOnboardingPlanLink(journeyId: string, url: string): Promise<Result> {
  await requirePermission("onboarding.reports");
  const { actor, ownerTeamMemberId } = await requireManagerScope(journeyId);
  if (!actor) return { ok: false, error: "Managers only." };
  if (!ownerTeamMemberId) return { ok: false, error: "Journey not found." };

  const res = await savePlanLink(journeyId, url, actor.teamMemberId);
  if (!res.ok) return res;

  refresh();
  return { ok: true };
}

// Upload (or replace) the plan document itself — markdown preferred, it
// renders readable at /team/onboarding/plan/[id].
export async function uploadOnboardingPlan(journeyId: string, formData: FormData): Promise<Result> {
  await requirePermission("onboarding.reports");
  const { actor, ownerTeamMemberId } = await requireManagerScope(journeyId);
  if (!actor) return { ok: false, error: "Managers only." };
  if (!ownerTeamMemberId) return { ok: false, error: "Journey not found." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Pick a file to upload." };

  const res = await uploadPlanDocument(journeyId, ownerTeamMemberId, actor.teamMemberId, file);
  if (!res.ok) return res;

  refresh();
  return { ok: true };
}

// Move a report's journey to another stage (board drag or drawer select).
export async function moveOnboardingStage(journeyId: string, stage: string): Promise<Result> {
  await requirePermission("onboarding.reports");
  const { actor, ownerTeamMemberId } = await requireManagerScope(journeyId);
  if (!actor) return { ok: false, error: "Managers only." };
  if (!ownerTeamMemberId) return { ok: false, error: "Journey not found." };

  const res = await setJourneyStage(journeyId, stage);
  if (!res.ok) return res;

  refresh();
  return { ok: true };
}

// Tick / untick one of the Day 1 orientation activities.
export async function toggleDay1Task(taskId: string, done: boolean): Promise<Result> {
  await requirePermission("onboarding.reports");
  const actor = await requireTeamMember();
  if (!taskId) return { ok: false, error: "Missing task." };

  // A Day-1 task is the new starter's own. The team scope a manager holds
  // reaches their reports' rows too, which is right for reading progress and
  // wrong for ticking someone else's orientation checklist (onboarding sweep).
  const { data: task, error: taskErr } = await companyOs
    .from("onboarding_tasks")
    .select("team_member_id")
    .eq("id", taskId)
    .maybeSingle();
  if (taskErr) return { ok: false, error: taskErr.message };
  if (!task || (task as { team_member_id: string | null }).team_member_id !== actor.teamMemberId) {
    return { ok: false, error: "Only the person this task belongs to can tick it." };
  }

  const { ok, error } = await teamUpdateInScope(actor, "onboarding_tasks", taskId, {
    status: done ? "done" : "todo",
    completed_at: done ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  });
  if (!ok) return { ok: false, error: error ?? "Could not update the task." };

  refresh();
  return { ok: true };
}
