"use server";

import { revalidatePath } from "next/cache";
import { requirePortalPermission } from "@/kernel/identity/access-request";
import { createPortalInquiryForActor } from "@/entities/portal/lib/inquiries";
import { createTeamRequestForActor, type TeamCandidateInput } from "@/entities/portal/lib/hire-requests";
import type { Result } from "@/kernel/data/result";

// The Requests page's own asks: a general request (a crm inquiry) and a hire
// request. requirePortalPermission() gates identity; each *ForActor helper
// re-checks company ownership before writing. The contractor work-request
// actions moved to the work-requests entity with its pages (ADR 0025).

function refresh(id?: string) {
  revalidatePath("/portal/requests");
  if (id) revalidatePath(`/portal/requests/${id}`);
}

export async function submitGeneralInquiry(input: { subject: string; message: string }): Promise<Result> {
  const actor = await requirePortalPermission("surface.portal");
  const r = await createPortalInquiryForActor(actor, input);
  if (r.ok) refresh();
  return r;
}

export async function submitTeamRequest(input: {
  companyId: string;
  candidates: TeamCandidateInput[];
}): Promise<Result & { id?: string }> {
  const actor = await requirePortalPermission("surface.portal");
  const r = await createTeamRequestForActor(actor, input);
  if (r.ok) refresh();
  return r;
}

