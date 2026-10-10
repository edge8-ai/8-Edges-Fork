"use server";

import { revalidatePath } from "next/cache";
import { requirePortalPermission } from "@/kernel/identity/access-request";
import {
  setClientPriorityForActor,
  proposeItemForActor,
  reorderGroupForActor,
} from "@/entities/portal/lib/backlog";

const BASE = "/portal/hub";

export async function reorderMyGroup(groupKey: string, orderedIds: string[]) {
  const actor = await requirePortalPermission("surface.portal");
  const r = await reorderGroupForActor(actor, groupKey, orderedIds);
  if (r.ok) revalidatePath(BASE);
  return r;
}

export async function setMyPriority(itemId: string, priority: string | null) {
  const actor = await requirePortalPermission("surface.portal");
  const r = await setClientPriorityForActor(actor, itemId, priority);
  if (r.ok) revalidatePath(BASE);
  return r;
}

export async function proposeMyItem(input: {
  companyId: string;
  groupKey: string;
  title: string;
  note?: string;
  priority?: string;
  // Set by the program page's roadmap tab, so the proposal lands in that
  // program; the hub's company-wide roadmap leaves it unset.
  aiProgramId?: string;
}) {
  const actor = await requirePortalPermission("surface.portal");
  const r = await proposeItemForActor(actor, input);
  if (r.ok) revalidatePath(BASE);
  return r;
}
