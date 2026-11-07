"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import {
  createRoadmapItemForActor,
  updateRoadmapItemForActor,
  type TeamRoadmapItemInput,
  type TeamRoadmapItemPatch,
} from "@/entities/team/lib/hub-roadmap";
import type { Result } from "@/kernel/data/result";

// Roadmap writes from the hub. The lib helpers own the scope rules (active
// staff assignment) and the field whitelist; these wrappers add identity and
// cache invalidation for both the hub and the client portal.

function refresh(companyId: string) {
  revalidatePath(`/team/clients/${companyId}`);
  revalidatePath(`/team/clients/${companyId}/roadmap`);
  revalidatePath("/portal/hub");
}

export async function teamCreateRoadmapItem(
  companyId: string,
  input: TeamRoadmapItemInput,
): Promise<Result & { id?: string }> {
  await requirePermission("team.clients");
  const actor = await requireTeamMember();
  const r = await createRoadmapItemForActor(actor, companyId, input);
  if (r.ok) {
    refresh(companyId);
    if (input.ai_program_id) {
      revalidatePath(`/team/clients/${companyId}/programs/${input.ai_program_id}`);
    }
  }
  return r;
}

export async function teamUpdateRoadmapItem(
  companyId: string,
  itemId: string,
  patch: TeamRoadmapItemPatch,
): Promise<Result> {
  await requirePermission("team.clients");
  const actor = await requireTeamMember();
  const r = await updateRoadmapItemForActor(actor, itemId, patch);
  if (r.ok) refresh(companyId);
  return r;
}
