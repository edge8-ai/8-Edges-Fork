"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { teamInsertOwn } from "@/entities/team/lib/data";
import { EQUIPMENT_TYPES } from "@/entities/org";

// Own-service equipment request. teamInsertOwn forces person_id = actor's own
// id server-side, so a request can only ever be raised as yourself.

const MAX_REASON = 1000;

export type RequestResult = { ok: true } | { ok: false; error: string };

export async function requestEquipment(input: {
  type: string;
  reason: string;
  neededBy?: string;
}): Promise<RequestResult> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();

  if (!(EQUIPMENT_TYPES as readonly string[]).includes(input.type)) {
    return { ok: false, error: "Pick what you need." };
  }
  const reason = input.reason?.trim() ?? "";
  if (!reason) return { ok: false, error: "Tell us what it's for." };
  if (reason.length > MAX_REASON) return { ok: false, error: "Keep the reason under 1000 characters." };

  const { error } = await teamInsertOwn(actor, "equipment_requests", {
    type: input.type,
    reason,
    needed_by: input.neededBy?.trim() || null,
  });
  if (error) return { ok: false, error };

  revalidatePath("/team/equipment");
  revalidatePath("/admin/operations/equipment");
  return { ok: true };
}
