import { companyOs } from "@/kernel/data/supabase";
import type { TablesUpdate } from "@/kernel/data/supabase/database.types";

// What company-os asks of onboarding plans, and the task writes team makes
// (A.70, ADR 0018). Until A.70 the door handed out `selectOnboardingPlans` and
// `updateOnboardingTasks`, and callers chose their own columns and chained
// their own filters. Each function here is the exact query or write its caller
// made: same columns, filters and payload.
// entities/onboarding/lib/onboarding-door.test.ts pins each one.

/** Every onboarding plan's stage, unordered (the admin talent dashboard counts them). */
export function onboardingStages() {
  return companyOs.from("onboarding_plans").select("stage");
}

/**
 * Writes `patch` to one onboarding task by id (team's own-service update, which
 * checks the task is in the actor's scope before it calls this). Resolves to
 * `{ error }`.
 */
export function editOnboardingTask(taskId: string, patch: TablesUpdate<{ schema: "company_os" }, "onboarding_tasks">) {
  return companyOs.from("onboarding_tasks").update(patch).eq("id", taskId);
}

/**
 * A new starter ticks or unticks a task on their own plan, from the /team home.
 * The write is filtered to the task and to the member's own id, so a manager's
 * wider read scope never reaches a report's checklist. Resolves to `{ error }`.
 */
export function tickOwnOnboardingTask(taskId: string, teamMemberId: string, done: boolean) {
  return companyOs
    .from("onboarding_tasks")
    .update({
      status: done ? "done" : "todo",
      completed_at: done ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .eq("team_member_id", teamMemberId);
}
