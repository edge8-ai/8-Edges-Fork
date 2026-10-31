"use server";

import { revalidateSurfaces } from "@/kernel/shell/surface";
import { requirePermission } from "@/kernel/identity/access-request";
import { companyOs } from "@/kernel/data/supabase";
import { createSignedDocumentUpload, recordDocument, recordLink, getDocumentRow, signedDownloadForPath, deleteDocumentRow, type DocResult } from "@/entities/client-programs";
import { programInCompany } from "@/entities/client-programs";

// Admin-side client documents: upload for any company (optionally tagged to one
// of its AI Programs), download, and delete ANY document. Gated by
// requirePermission("crm.pipeline") throughout; the client portal's uploader-only delete rule does
// not apply here — Edge8 operates the whole surface.

function refresh(companyId: string) {
  revalidateSurfaces(`/revenue/companies/${companyId}`);
}

export async function adminSignedDocumentUpload(input: {
  companyId: string;
  filename: string;
  programId?: string | null;
}): Promise<DocResult<{ signedUrl: string; path: string }>> {
  await requirePermission("crm.pipeline");
  // A tagged upload must tag a program that actually belongs to this company.
  if (input.programId) {
    const programAnswer = await programInCompany(input.programId, input.companyId);
    if (!programAnswer.ok) return { ok: false, error: programAnswer.error };
    if (!programAnswer.program) return { ok: false, error: "That program does not belong to this company." };
  }
  return createSignedDocumentUpload(input);
}

export async function adminRecordDocument(input: {
  companyId: string;
  programId?: string | null;
  path: string;
  filename: string;
  sizeBytes: number | null;
}): Promise<DocResult> {
  const { user: admin } = await requirePermission("crm.pipeline");
  const r = await recordDocument({ ...input, uploadedBy: admin.email });
  if (r.ok) refresh(input.companyId);
  return r;
}

export async function adminAddLink(input: {
  companyId: string;
  programId?: string | null;
  url: string;
  title?: string | null;
}): Promise<DocResult> {
  const { user: admin } = await requirePermission("crm.pipeline");
  if (input.programId) {
    const programAnswer = await programInCompany(input.programId, input.companyId);
    if (!programAnswer.ok) return { ok: false, error: programAnswer.error };
    if (!programAnswer.program) return { ok: false, error: "That program does not belong to this company." };
  }
  const r = await recordLink({ ...input, uploadedBy: admin.email });
  if (r.ok) refresh(input.companyId);
  return r;
}

export async function adminDownloadDocument(
  documentId: string,
): Promise<DocResult<{ url: string; filename: string }>> {
  await requirePermission("crm.pipeline");
  const row = await getDocumentRow(documentId);
  if (!row) return { ok: false, error: "Not found." };
  if (!row.storagePath) {
    return row.url ? { ok: true, url: row.url, filename: row.filename } : { ok: false, error: "Not found." };
  }
  const r = await signedDownloadForPath(row.storagePath, row.filename);
  if (!r.ok) return r;
  return { ok: true, url: r.url, filename: row.filename };
}

export async function adminDeleteDocument(documentId: string): Promise<DocResult> {
  await requirePermission("crm.pipeline");
  const row = await getDocumentRow(documentId);
  if (!row) return { ok: false, error: "Not found." };
  const r = await deleteDocumentRow(row);
  if (r.ok) refresh(row.companyId);
  return r;
}
