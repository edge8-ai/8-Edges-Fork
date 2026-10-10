// Shared core for client documents (company_os.program_documents + the private
// program-documents bucket). Documents belong to a client COMPANY; tagging to an
// AI Program is optional (docs/plans/2026-08-11-client-portal-improvements.md).
//
// This module is auth-agnostic on purpose: it filters by whatever company ids the
// caller passes and trusts nothing else. Every surface wraps it with its own
// gate + scope: /portal via the actor's companyScope (entities/portal/lib/documents.ts),
// /admin via requireAdmin (documents-actions.ts), /team via the actor's active
// staff_assignments (lib/team/clients.ts). Never call it with ids that did not
// come from one of those scopes.

import { supabase, companyOs } from "@/kernel/data/supabase";
import { one } from "@/kernel/config/embedded";
import { externalHref } from "@/kernel/ui/url";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

export const DOCUMENTS_BUCKET = "program-documents";
const DOWNLOAD_TTL_SECONDS = 60 * 5;

export type ClientDocument = {
  id: string;
  companyId: string;
  programId: string | null;
  programName: string | null;
  filename: string;
  url: string | null; // external link rows carry a url instead of a storage object
  sizeBytes: number | null;
  uploadedBy: string | null; // email as recorded at upload time
  uploaderName: string | null; // resolved display name, when the email matches a person
  createdAt: string;
  // An agreement or its signed copy (stored under company/<id>/agreements/).
  // The portal lists those on the agreement page only, never in Documents,
  // so a draft Edge8 has not signed yet is not in front of the client.
  isAgreement: boolean;
};

type Err = { ok: false; error: string };
export type DocResult<T = unknown> = ({ ok: true } & T) | Err;

type DocRow = {
  id: string;
  company_id: string;
  ai_program_id: string | null;
  storage_path: string | null;
  filename: string;
  url: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
  program: { name: string | null } | { name: string | null }[] | null;
};

// Agreements live under their own prefix so every list can tell them apart
// from ordinary documents without reading the approvals that sign them.
const AGREEMENTS_SEGMENT = "agreements";

export function isAgreementPath(path: string | null | undefined): boolean {
  return !!path && /^company\/[^/]+\/agreements\//.test(path);
}

// Sanitize a user filename for use as a storage object key segment.
export function safeDocName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() || "file";
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

const SELECT =
  "id, company_id, ai_program_id, storage_path, filename, url, size_bytes, uploaded_by, created_at, program:ai_programs!ai_program_id(name)";

/**
 * A PostgREST `or` filter matching `column` to any of these emails, ignoring
 * case (S.16.24). people.email keeps whatever capitals the person typed, and
 * `.in()` is case-sensitive, so a lower-cased list found nobody whose address
 * had a capital — half the portal's documents lost their uploader. `ilike`
 * also reads `_` and `%` as wildcards, so a caller keeps only the rows whose
 * lower-cased email is in its own list; the filter narrows, it does not decide.
 */
export function emailsFilter(column: string, emails: string[]): string {
  return emails.map((e) => `${column}.ilike."${e.replace(/["\\]/g, "")}"`).join(",");
}

// Uploaded-by emails resolve to people names for display; unmatched emails show
// as-is. One query for the whole list.
async function uploaderNames(emails: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(emails.filter(Boolean).map((e) => e.toLowerCase()))];
  if (unique.length === 0) return new Map();
  const { data, error: peopleError } = await companyOs
    .from("people")
    .select(NAME_COLUMNS)
    .or(emailsFilter("email", unique));
  if (peopleError) console.error("[portal] people read failed:", peopleError.message);
  const map = new Map<string, string>();
  for (const p of (data ?? []) as Array<NamedPerson & { email: string }>) {
    // ilike's wildcards can bring back an address not asked for; only the
    // listed ones count (S.16.24).
    const email = p.email?.toLowerCase();
    if (!email || !unique.includes(email)) continue;
    // The email is only the key: the list reaches the client portal, so a
    // nameless uploader gets no name here rather than their address as one.
    const name = personName({ ...p, email: null }, null);
    if (name) map.set(email, name);
  }
  return map;
}

function mapRows(rows: DocRow[], names: Map<string, string>): ClientDocument[] {
  return rows.map((r) => ({
    id: r.id,
    companyId: r.company_id,
    programId: r.ai_program_id,
    programName: one(r.program)?.name ?? null,
    filename: r.filename,
    url: r.url,
    sizeBytes: r.size_bytes,
    uploadedBy: r.uploaded_by,
    uploaderName: r.uploaded_by ? names.get(r.uploaded_by.toLowerCase()) ?? null : null,
    createdAt: r.created_at,
    isAgreement: isAgreementPath(r.storage_path),
  }));
}

// Every document for the given companies, newest first. companyIds MUST come
// from the caller's own scope (see module header).
export async function listDocumentsForCompanies(companyIds: string[]): Promise<ClientDocument[]> {
  if (companyIds.length === 0) return [];
  const { data, error: programDocumentsError } = await companyOs
    .from("program_documents")
    .select(SELECT)
    .in("company_id", companyIds)
    .order("created_at", { ascending: false });
  if (programDocumentsError) console.error("[portal] program_documents read failed:", programDocumentsError.message);
  const rows = (data ?? []) as unknown as DocRow[];
  const names = await uploaderNames(rows.map((r) => r.uploaded_by ?? ""));
  return mapRows(rows, names);
}

// One document row, unscoped — the caller must check company_id against its own
// scope before acting on the result.
export async function getDocumentRow(id: string): Promise<{
  id: string;
  companyId: string;
  storagePath: string | null;
  filename: string;
  url: string | null;
  uploadedBy: string | null;
} | null> {
  const { data, error: programDocumentsError2 } = await companyOs
    .from("program_documents")
    .select("id, company_id, storage_path, filename, url, uploaded_by")
    .eq("id", id)
    .maybeSingle();
  if (programDocumentsError2) console.error("[portal] program_documents read failed:", programDocumentsError2.message);
  const row = data as {
    id: string;
    company_id: string;
    storage_path: string | null;
    filename: string;
    url: string | null;
    uploaded_by: string | null;
  } | null;
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.company_id,
    storagePath: row.storage_path,
    filename: row.filename,
    url: row.url,
    uploadedBy: row.uploaded_by,
  };
}

// Short-lived signed download URL (private bucket). Scope-check the row first.
export async function signedDownloadForPath(
  storagePath: string,
  filename: string,
): Promise<DocResult<{ url: string }>> {
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, DOWNLOAD_TTL_SECONDS, { download: filename });
  if (error || !data) return { ok: false, error: "Could not open the document." };
  return { ok: true, url: data.signedUrl };
}

// Step 1 of direct-to-storage upload: a one-shot signed upload URL. Company-level
// documents live under company/<id>/docs/; program-tagged uploads keep the
// original company/<id>/program/<id>/ prefix (set by the caller via programId).
export async function createSignedDocumentUpload(input: {
  companyId: string;
  filename: string;
  programId?: string | null;
}): Promise<DocResult<{ signedUrl: string; path: string }>> {
  const segment = input.programId ? `program/${input.programId}` : "docs";
  const path = `company/${input.companyId}/${segment}/${crypto.randomUUID()}-${safeDocName(input.filename)}`;
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Could not start the upload." };
  return { ok: true, signedUrl: data.signedUrl, path };
}

// Step 2: record the uploaded object. The path guard pins the object under the
// company's prefix so a tampered path can never cross companies.
export async function recordDocument(input: {
  companyId: string;
  programId?: string | null;
  path: string;
  filename: string;
  sizeBytes: number | null;
  uploadedBy: string;
}): Promise<DocResult<{ id: string | null }>> {
  if (!input.path.startsWith(`company/${input.companyId}/`)) {
    return { ok: false, error: "Invalid upload path." };
  }
  const { data: inserted, error } = await companyOs.from("program_documents").insert({
    company_id: input.companyId,
    ai_program_id: input.programId ?? null,
    storage_path: input.path,
    filename: safeDocName(input.filename),
    size_bytes: input.sizeBytes,
    uploaded_by: input.uploadedBy,
  }).select("id").maybeSingle();
  if (error) {
    // Unique violation means another row already owns this object — do NOT
    // remove it, or a re-claimed path would delete the original row's file.
    if (error.code !== "23505") {
      await supabase.storage.from(DOCUMENTS_BUCKET).remove([input.path]);
    }
    return { ok: false, error: "Could not save the document." };
  }
  return { ok: true, id: inserted?.id ?? null };
}

// Server-side upload of an agreement (or its signed copy) the server built or
// received itself, so there is no browser to hand a signed upload URL to. The
// path is fresh every time: a stored agreement is never overwritten, because
// its fingerprint is what both parties signed.
export async function uploadAgreementBytes(input: {
  companyId: string;
  filename: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<DocResult<{ path: string }>> {
  const path = `company/${input.companyId}/${AGREEMENTS_SEGMENT}/${crypto.randomUUID()}-${safeDocName(input.filename)}`;
  const { error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, input.bytes, { contentType: input.contentType, upsert: false });
  if (error) return { ok: false, error: `Could not store the file: ${error.message}` };
  return { ok: true, path };
}

// The stored bytes of a document, for re-checking an agreement's fingerprint
// before anyone signs it. Scope-check the row first.
export async function downloadDocumentBytes(storagePath: string): Promise<DocResult<{ bytes: Uint8Array }>> {
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).download(storagePath);
  if (error || !data) return { ok: false, error: `Could not read the stored file${error ? `: ${error.message}` : "."}` };
  return { ok: true, bytes: new Uint8Array(await data.arrayBuffer()) };
}

// Record an external link as a document row. No storage object; filename holds
// the display title (caller-provided title, or the link's hostname).
export async function recordLink(input: {
  companyId: string;
  programId?: string | null;
  url: string;
  title?: string | null;
  uploadedBy: string;
}): Promise<DocResult> {
  const url = externalHref(input.url);
  if (!url) return { ok: false, error: "Enter a valid http(s) link." };
  const { error } = await companyOs.from("program_documents").insert({
    company_id: input.companyId,
    ai_program_id: input.programId ?? null,
    storage_path: null,
    url,
    filename: (input.title ?? "").trim().slice(0, 120) || new URL(url).hostname,
    size_bytes: null,
    uploaded_by: input.uploadedBy,
  });
  if (error) return { ok: false, error: "Could not save the link." };
  return { ok: true };
}

// Remove the storage object, then the row. Callers do the scope/ownership check;
// this just executes. Storage-first so a failed removal never leaves a row that
// points at a live file the user believes deleted. Link rows have no object.
export async function deleteDocumentRow(row: { id: string; storagePath: string | null }): Promise<DocResult> {
  if (row.storagePath) {
    const { error: storageErr } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([row.storagePath]);
    if (storageErr) return { ok: false, error: "Could not delete the file." };
  }
  const { error } = await companyOs.from("program_documents").delete().eq("id", row.id);
  if (error) return { ok: false, error: "Could not delete the document record." };
  return { ok: true };
}
