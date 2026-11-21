"use server";

import { revalidatePath } from "next/cache";
import { requirePortalPermission } from "@/kernel/identity/access-request";
import {
  addScopeForActor,
  cancelWorkRequestForActor,
  createWorkRequestForActor,
  decideEstimateForActor,
  decideWorkForActor,
} from "@/entities/work-requests/lib/client-work-requests";
import { openContractorCard } from "@/entities/work-requests/lib/contractor-card";
import type { Result } from "@/kernel/data/result";

// Client-portal actions for contractor work requests, which moved here from the
// portal with their pages (ADR 0025). requirePortalPermission() gates identity;
// every *ForActor helper re-checks company ownership before writing (no trust in
// client-supplied ids). Status guards live in the shared state machine
// (entities/work-requests/lib/work-requests.ts), so a stale form gets a friendly
// error, not an illegal transition.

function refresh(id?: string) {
  revalidatePath("/portal/requests");
  if (id) revalidatePath(`/portal/requests/${id}`);
}

export async function createProjectRequest(input: {
  companyId: string;
  contractorPersonId: string;
  title: string;
  brief: string;
}): Promise<Result & { id?: string }> {
  const actor = await requirePortalPermission("surface.portal");
  const r = await createWorkRequestForActor(actor, input);
  if (r.ok && r.id) await openContractorCard({ id: r.id, title: input.title.trim(), brief: input.brief.trim(), person_id: input.contractorPersonId });
  if (r.ok) refresh(r.id);
  return r;
}

export async function decideEstimate(
  id: string,
  decision: "approved" | "rejected" | "changes_requested",
  note: string,
): Promise<Result> {
  const actor = await requirePortalPermission("surface.portal");
  const r = await decideEstimateForActor(actor, id, decision, note);
  if (r.ok) refresh(id);
  return r;
}

export async function decideWork(id: string, decision: "accepted" | "revision", note: string): Promise<Result> {
  const actor = await requirePortalPermission("surface.portal");
  const r = await decideWorkForActor(actor, id, decision, note);
  if (r.ok) refresh(id);
  return r;
}

export async function cancelRequest(id: string, note: string): Promise<Result> {
  const actor = await requirePortalPermission("surface.portal");
  const r = await cancelWorkRequestForActor(actor, id, note);
  if (r.ok) refresh(id);
  return r;
}

export async function addScope(id: string, scope: string): Promise<Result> {
  const actor = await requirePortalPermission("surface.portal");
  const r = await addScopeForActor(actor, id, scope);
  if (r.ok) refresh(id);
  return r;
}
