"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import {
  signedClientDocumentDownloadForActor,
  signedClientDocumentUploadForActor,
  recordClientDocumentForActor,
  addClientLinkForActor,
  deleteOwnClientDocumentForActor,
} from "@/entities/team/lib/hub-clients";
import type { DocResult } from "@/entities/portal";

// Team-side client documents: download, upload, and uploader-only delete.
// Every action re-checks that the document's company is in the actor's active
// staff assignments; the lib helpers own the scope rules.

export async function teamDownloadClientDocument(
  documentId: string,
): Promise<{ ok: true; url: string; filename: string } | { ok: false; error: string }> {
  await requirePermission("team.clients");
  const actor = await requireTeamMember();
  return signedClientDocumentDownloadForActor(actor, documentId);
}

export async function teamSignedClientDocumentUpload(input: {
  companyId: string;
  filename: string;
  programId?: string | null;
}): Promise<DocResult<{ signedUrl: string; path: string }>> {
  await requirePermission("team.clients");
  const actor = await requireTeamMember();
  return signedClientDocumentUploadForActor(actor, input);
}

export async function teamRecordClientDocument(input: {
  companyId: string;
  path: string;
  filename: string;
  sizeBytes: number | null;
  programId?: string | null;
}): Promise<DocResult> {
  await requirePermission("team.clients");
  const actor = await requireTeamMember();
  const r = await recordClientDocumentForActor(actor, input);
  if (r.ok) {
    revalidatePath(`/team/clients/${input.companyId}`);
    revalidatePath(`/team/clients/${input.companyId}/documents`);
    if (input.programId) {
      revalidatePath(`/team/clients/${input.companyId}/programs/${input.programId}`);
    }
  }
  return r;
}

export async function teamAddClientLink(input: {
  companyId: string;
  url: string;
  title?: string | null;
}): Promise<DocResult> {
  await requirePermission("team.clients");
  const actor = await requireTeamMember();
  const r = await addClientLinkForActor(actor, input);
  if (r.ok) {
    revalidatePath(`/team/clients/${input.companyId}`);
    revalidatePath(`/team/clients/${input.companyId}/documents`);
  }
  return r;
}

export async function teamDeleteOwnClientDocument(documentId: string): Promise<DocResult> {
  await requirePermission("team.clients");
  const actor = await requireTeamMember();
  return deleteOwnClientDocumentForActor(actor, documentId);
}
