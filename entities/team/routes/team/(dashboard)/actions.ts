"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { companyOs } from "@/kernel/data/supabase";
import { updatePeople } from "@/kernel/identity/writes";
import type { Json } from "@/kernel/data/supabase/database.types";
import { updateOnboardingTasks } from "@/entities/onboarding";
import type { Result } from "@/kernel/data/result";

// Stamp the actor's own onboarding as done (or clear it, to replay the tour).
// Self-scoped: writes only the actor's own person row.
export async function setOnboardingDone(done: boolean): Promise<void> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const { data, error: readError } = await companyOs
    .from("people")
    .select("metadata")
    .eq("id", actor.personId)
    .maybeSingle();
  if (readError) console.error("[team/actions] people", readError);
  const metadata = ((data as { metadata: Record<string, Json> | null } | null)?.metadata) ?? {};
  metadata.onboarding_completed_at = done ? new Date().toISOString() : null;
  const { error: writeError } = await updatePeople({ metadata, updated_at: new Date().toISOString() })
    .eq("id", actor.personId);
  if (writeError) console.error("[team/actions] people", writeError);
  revalidatePath("/team");
}

// A new hire ticking an item on their own onboarding plan from the /team home.
// Self-scoped twice over: the writer is filtered to the actor's own team member
// id, so a manager's wider read scope never reaches a report's checklist here.
export async function toggleMyOnboardingTask(taskId: string, done: boolean): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  if (!taskId) return { ok: false, error: "Missing task." };
  const { error } = await updateOnboardingTasks({
    status: done ? "done" : "todo",
    completed_at: done ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  })
    .eq("id", taskId)
    .eq("team_member_id", actor.teamMemberId);
  if (error) return { ok: false, error: "Could not update the task." };
  revalidatePath("/team");
  return { ok: true };
}
