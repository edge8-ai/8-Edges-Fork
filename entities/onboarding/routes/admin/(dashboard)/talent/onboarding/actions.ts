"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { companyOs } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { savePlanLink, uploadPlanDocument, setJourneyStage } from "@/entities/onboarding";
import { updateOnboardingTasks } from "@/entities/onboarding";
import { updateTeamMembers } from "@/kernel/identity/writes";
import type { Result } from "@/kernel/data/result";

// Admin-side board actions. The admin mirror of the manager actions in
// app/team/(dashboard)/onboarding/actions.ts — same operations, gated by
// requirePermission("onboarding.manage") instead of team scope, and never reused from /team (the same
// IDOR boundary as the time-off split).

function refresh() {
  revalidatePath("/admin/talent/onboarding");
}

async function journeyMember(journeyId: string): Promise<string | null> {
  const { data, error } = await companyOs
    .from("onboarding_plans")
    .select("team_member_id")
    .eq("id", journeyId)
    .maybeSingle();
  if (error) {
    console.error(`[talent/onboarding] plan lookup ${journeyId} failed: ${error.message}`);
    return null;
  }
  return (data as { team_member_id: string } | null)?.team_member_id ?? null;
}

// The admin's own team_members row, if they have one — plan_uploaded_by
// references team_members, and an admin acting on a manager's behalf may not.
async function selfMembership(email: string): Promise<string | null> {
  const { data, error } = await companyOs
    .from("people")
    .select("team_members:team_members!person_id(id)")
    .eq("email", email)
    .maybeSingle();
  if (error) {
    console.error(`[talent/onboarding] self membership lookup failed: ${error.message}`);
    return null;
  }
  const row = data as unknown as { team_members: { id: string }[] | { id: string } | null } | null;
  return Array.isArray(row?.team_members)
    ? row?.team_members[0]?.id ?? null
    : row?.team_members?.id ?? null;
}

export async function adminSetOnboardingPlanLink(journeyId: string, url: string): Promise<Result> {
  const { user: admin } = await requirePermission("onboarding.manage");
  if (!journeyId) return { ok: false, error: "Missing journey." };
  if (!(await journeyMember(journeyId))) return { ok: false, error: "Journey not found." };

  const res = await savePlanLink(journeyId, url, await selfMembership(admin.email));
  if (!res.ok) return res;

  await recordAudit({
    table: "onboarding_plans",
    recordId: journeyId,
    operation: "update",
    actor: admin.email,
    context: { action: "plan_link_set", via: "admin" },
  });
  refresh();
  return { ok: true };
}

export async function adminUploadOnboardingPlan(journeyId: string, formData: FormData): Promise<Result> {
  const { user: admin } = await requirePermission("onboarding.manage");
  if (!journeyId) return { ok: false, error: "Missing journey." };
  const teamMemberId = await journeyMember(journeyId);
  if (!teamMemberId) return { ok: false, error: "Journey not found." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Pick a file to upload." };

  const res = await uploadPlanDocument(journeyId, teamMemberId, await selfMembership(admin.email), file);
  if (!res.ok) return res;

  await recordAudit({
    table: "onboarding_plans",
    recordId: journeyId,
    operation: "update",
    actor: admin.email,
    context: { action: "plan_upload", via: "admin" },
  });
  refresh();
  return { ok: true };
}

// Move a journey to another stage (board drag or drawer select).
export async function adminMoveOnboardingStage(journeyId: string, stage: string): Promise<Result> {
  const { user: admin } = await requirePermission("onboarding.manage");
  if (!journeyId) return { ok: false, error: "Missing journey." };

  const res = await setJourneyStage(journeyId, stage);
  if (!res.ok) return res;

  await recordAudit({
    table: "onboarding_plans",
    recordId: journeyId,
    operation: "update",
    actor: admin.email,
    context: { action: "stage_moved", stage, via: "admin" },
  });
  refresh();
  return { ok: true };
}

// Adjust the cycle's Day 1. Everything is keyed off the start date, so the
// rest of the timeline moves with it: probation end and contract start shift
// by the same number of days, and the Day 1 checklist due date follows.
export async function adminSetOnboardingStartDate(journeyId: string, date: string): Promise<Result> {
  const { user: admin } = await requirePermission("onboarding.manage");
  if (!journeyId) return { ok: false, error: "Missing journey." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    return { ok: false, error: "Pick a valid date." };
  }

  const teamMemberId = await journeyMember(journeyId);
  if (!teamMemberId) return { ok: false, error: "Journey not found." };

  const { data: tm, error: tmErr } = await companyOs
    .from("team_members")
    .select("start_date, probation_ends_on, contract_start_date")
    .eq("id", teamMemberId)
    .maybeSingle();
  if (tmErr) return { ok: false, error: tmErr.message };
  const current = tm as {
    start_date: string | null;
    probation_ends_on: string | null;
    contract_start_date: string | null;
  } | null;

  const shift = (iso: string | null, days: number): string | null =>
    iso ? new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10) : null;
  const deltaDays = current?.start_date
    ? Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${current.start_date}T00:00:00Z`)) / 86400000)
    : 0;

  const { error } = await updateTeamMembers({
      start_date: date,
      probation_ends_on: shift(current?.probation_ends_on ?? null, deltaDays),
      contract_start_date: shift(current?.contract_start_date ?? null, deltaDays),
      updated_at: new Date().toISOString(),
    })
    .eq("id", teamMemberId);
  if (error) return { ok: false, error: "Could not update the start date." };

  // DAY1_CATEGORY in lib/onboarding-cycle.ts
  const { error: day1Err } = await updateOnboardingTasks({
    due_date: date,
    updated_at: new Date().toISOString(),
  })
    .eq("team_member_id", teamMemberId)
    .eq("category", "day_1");
  if (day1Err) return { ok: false, error: day1Err.message };

  await recordAudit({
    table: "team_members",
    recordId: teamMemberId,
    operation: "update",
    actor: admin.email,
    context: { action: "onboarding_start_date_set", date, shifted_days: deltaDays, via: "admin" },
  });
  refresh();
  return { ok: true };
}

export async function adminToggleDay1Task(taskId: string, done: boolean): Promise<Result> {
  await requirePermission("onboarding.manage");
  if (!taskId) return { ok: false, error: "Missing task." };

  const { error } = await updateOnboardingTasks({
      status: done ? "done" : "todo",
      completed_at: done ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId);
  if (error) return { ok: false, error: "Could not update the task." };

  refresh();
  return { ok: true };
}
