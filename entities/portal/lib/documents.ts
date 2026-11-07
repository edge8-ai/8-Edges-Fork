// Portal "Documents" data access: the company-level document list and
// delete-own for /portal/documents. Same discipline as entities/portal/lib/ai-programs.ts:
// every read/write is scoped to the actor's own companyScope and cross-company
// ids are rejected (IDOR guard). Delete is uploader-only on this surface: you
// may remove what you uploaded, never someone else's file
// (docs/plans/2026-08-11-client-portal-improvements.md, PR 1). The upload,
// record-link and signed-download helpers left with the unused DocumentsView
// in E8-13; lib/client-documents still holds the primitives.

import type { PortalActor } from "@/kernel/identity/portal-auth";
import { uploaderLabels } from "./uploader-label";
import {
  listDocumentsForCompanies,
  getDocumentRow,
  deleteDocumentRow,
  type ClientDocument,
  type DocResult,
} from "@/entities/client-programs";

export type { ClientDocument } from "@/entities/client-programs";

// Agreements are left out: a client reaches them on their agreement page,
// which shows only the named signer an agreement Edge8 has signed and never
// an admin viewing the portal as the client (entities/crm/lib/agreements.ts).
//
// The uploader is relabelled for a client's eyes (S.16.21): "Edge8" for staff,
// a name for a client contact, nothing otherwise — the shared loader's own
// name is for staff screens and may be a staff member's personal name.
export async function listDocumentsForActor(actor: PortalActor): Promise<ClientDocument[]> {
  const docs = (await listDocumentsForCompanies(actor.companyScope)).filter((d) => !d.isAgreement);
  const labels = await uploaderLabels(docs.map((d) => d.uploadedBy));
  return docs.map((d) => ({ ...d, uploaderName: d.uploadedBy ? (labels.get(d.uploadedBy.toLowerCase()) ?? null) : null }));
}

// Uploader-only delete: the row must be in the actor's company scope AND carry
// their email as uploader. Admin-side delete (any document) lives in the admin
// actions, not here.
export async function deleteOwnDocument(actor: PortalActor, documentId: string): Promise<DocResult> {
  const row = await getDocumentRow(documentId);
  if (!row || !actor.companyScope.includes(row.companyId)) return { ok: false, error: "Not found." };
  if ((row.uploadedBy ?? "").toLowerCase() !== actor.email.toLowerCase()) {
    return { ok: false, error: "You can only delete documents you uploaded." };
  }
  return deleteDocumentRow(row);
}
