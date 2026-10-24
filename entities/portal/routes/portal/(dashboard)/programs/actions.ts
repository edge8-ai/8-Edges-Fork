"use server";

import { revalidatePath } from "next/cache";
import { requirePortalPermission } from "@/kernel/identity/access-request";
import {
  createUploadProgram,
  saveChatPlan,
  signedProgramUpload,
  recordProgramDocument,
  signedDocumentDownload,
  type Result,
} from "@/entities/portal/lib/ai-programs";

// Client-portal actions for AI Programs. requirePortalPermission() gates identity;
// every *ForActor helper re-checks company ownership before writing (no trust in
// client-supplied ids).

function refresh(programId?: string) {
  revalidatePath("/portal/programs");
  if (programId) revalidatePath(`/portal/programs/${programId}`);
}

export async function createUploadProgramAction(input: {
  companyId?: string;
  name: string;
}): Promise<Result<{ programId: string; planId: string }>> {
  const actor = await requirePortalPermission("surface.portal");
  const r = await createUploadProgram(actor, input);
  if (r.ok) refresh(r.programId);
  return r;
}

export async function signedUploadAction(input: {
  programId: string;
  filename: string;
}): Promise<Result<{ signedUrl: string; path: string }>> {
  const actor = await requirePortalPermission("surface.portal");
  return signedProgramUpload(actor, input);
}

export async function recordDocumentAction(input: {
  programId: string;
  path: string;
  filename: string;
  sizeBytes: number | null;
}): Promise<Result> {
  const actor = await requirePortalPermission("surface.portal");
  const r = await recordProgramDocument(actor, input);
  if (r.ok) refresh(input.programId);
  return r;
}

export async function saveChatPlanAction(input: {
  companyId?: string;
  name: string;
  briefHtml: string;
}): Promise<Result<{ programId: string; planId: string }>> {
  const actor = await requirePortalPermission("surface.portal");
  const r = await saveChatPlan(actor, input);
  if (r.ok) refresh(r.programId);
  return r;
}

export async function downloadDocumentAction(
  documentId: string,
): Promise<Result<{ url: string; filename: string }>> {
  const actor = await requirePortalPermission("surface.portal");
  return signedDocumentDownload(actor, documentId);
}
