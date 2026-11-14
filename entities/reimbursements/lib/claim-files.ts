// Receipts, red invoices and bank deductions on a claim item (design §1.4, RB.20): start an
// upload, confirm it, cancel it, take it off a claim still being written (deleted from a
// draft never submitted, marked replaced on a claim that was: plan §10, 20261008090000), and
// open one. The steps are the document store's (document-store.ts, RB.30); this module states
// the claim's policy: where its rows are kept, the kinds it takes (a red invoice must be a
// PDF, by its declared type and by its bytes), and who may open one. Marking a document
// replaced and refiling an abroad invoice are claim rules and stay here.
//
// Until confirm the row is unconfirmed, no screen shows it, and the daily sweep
// (crons/receipt-sweep.ts) clears it.
//
// Not a "use server" file: every caller is an owner action that has already
// run its guard; these functions take the person id that guard proved.
import { mustRows } from "@/kernel/data/read";
import { recordAudit } from "@/kernel/audit/audit";
import { ITEM_DOCUMENT_KINDS, type DocumentKind } from "./claim-labels";
import { confirmUpload, discardUpload, openDocument, openDocuments, removeDocument, startUpload, type DocumentRecords } from "./document-store";
import { KEPT_DOCUMENT, openForOwner } from "./own-claims";
import { selectReimbursementFiles } from "./reads";
import { deleteReimbursementFiles, insertReimbursementFiles, updateReimbursementFiles } from "./writes";

export type { DocumentKind };
type Refused = { ok: false; error: string };

/** Where a claim keeps its documents' rows, each step scoped to one receipt (a claim item). */
const recordsOf = (itemId: string): DocumentRecords => ({
  countUnfinished: (since) =>
    selectReimbursementFiles("id", { count: "exact", head: true }).eq("claim_item_id", itemId).is("confirmed_at", null).gte("created_at", since),
  dropUnfinished: (id) => deleteReimbursementFiles().eq("id", id).is("confirmed_at", null).select("id"),
  saveConfirmed: (id, facts) => updateReimbursementFiles(facts).eq("id", id).is("confirmed_at", null).select("id"),
});

/** Why a photo is never a red invoice: said when one is uploaded as one, and when its owner refiles one as one (file-kind.ts). */
export const RED_INVOICE_MUST_BE_PDF = "A red invoice must be a PDF: the seller's e-invoice, or a scan saved as PDF. A photo is a receipt.";

/** Begins an upload: an unconfirmed row and a signed token for its object. */
export async function startReceiptUpload(input: {
  itemId: string;
  kind: DocumentKind;
  personId: string;
  declared: { name: string; size: number; type: string };
}): Promise<{ ok: true; fileId: string; bucket: string; path: string; token: string } | Refused> {
  const item = await openForOwner({ itemId: input.itemId }, input.personId, "edit");
  if (!item.ok) return item;
  if (item.value.removed) return { ok: false, error: "This receipt was removed from the claim. Add a new receipt instead." };
  // RB.20: what the bank took in dong for a purchase in another currency. A
  // dong receipt is its own value, so a deduction there would prove nothing.
  if (input.kind === "bank_deduction" && item.value.currency === "vnd") return { ok: false, error: "A bank deduction is for a receipt paid in another currency." };
  if (input.kind === "red_invoice" && input.declared.type !== "application/pdf") return { ok: false, error: RED_INVOICE_MUST_BE_PDF };
  return startUpload({
    records: recordsOf(input.itemId),
    insert: (file) =>
      insertReimbursementFiles({
        id: file.id,
        kind: input.kind,
        claim_item_id: input.itemId,
        storage_path: file.path,
        filename: file.filename,
        mime_type: input.declared.type,
        size_bytes: input.declared.size,
        uploaded_by: input.personId,
      }),
    folder: `claim/${item.value.claim.id}/${input.itemId}`,
    holder: "receipt",
    declared: input.declared,
  });
}

/** Looks at what arrived and either confirms it or refuses and removes it. */
export async function confirmReceiptUpload(input: { fileId: string; personId: string }): Promise<{ ok: true; kind: string } | Refused> {
  const file = await openForOwner({ fileId: input.fileId }, input.personId, "confirm");
  if (!file.ok) return file;
  // The kind goes back so the caller has the right reader read it (RB.20).
  const confirmed = { ok: true as const, kind: file.value.kind };
  if (file.value.confirmed) return confirmed;
  const { id, itemId, storagePath: path, filename: name } = file.value;
  const result = await confirmUpload({
    records: recordsOf(itemId),
    file: { id, path, filename: name },
    pdfOnly: file.value.kind === "red_invoice" ? `${name} is not a PDF. A red invoice must be the PDF itself, not a photo of it.` : null,
  });
  return result.ok ? confirmed : result;
}

/** Cancel: the browser stopped an upload in flight; this clears what it left. */
export async function cancelReceiptUpload(input: { fileId: string; personId: string }): Promise<{ ok: true } | Refused> {
  const file = await openForOwner({ fileId: input.fileId }, input.personId, "read");
  if (!file.ok) return file;
  if (!file.value.confirmed) await discardUpload(recordsOf(file.value.itemId), { id: file.value.id, path: file.value.storagePath });
  return { ok: true };
}

/**
 * Deletes a document from a draft that was never submitted. From a claim that
 * was, a confirmed document is refused here, saying to mark it replaced
 * instead (`markReceiptFileReplaced`), because the database refuses that
 * delete too (20261008090000) and its refusal reads the same; an upload never
 * confirmed was never a document, and goes from any claim. The row goes
 * first, because the database decides, and an object removed before a
 * refused delete would be a kept record with no file.
 */
export async function removeReceiptFile(input: { fileId: string; personId: string }): Promise<{ ok: true } | Refused> {
  const file = await openForOwner({ fileId: input.fileId }, input.personId, "delete");
  if (!file.ok) return file;
  const fileId = file.value.id;
  return removeDocument({
    path: file.value.storagePath,
    deleteRow: () => deleteReimbursementFiles().eq("id", fileId).select("id"),
    kept: KEPT_DOCUMENT,
    missing: "That file is no longer on the claim.",
  });
}

/**
 * Sets a confirmed receipt or red invoice aside on a claim that was ever
 * submitted (sent back, or withdrawn to a draft), which keeps it: it stays
 * beside its item, shown as replaced, and satisfies nothing — a replaced red
 * invoice no longer meets the Vietnam rule (claim-rules `canSubmit`), so the
 * owner adds the new one. Guarded on not being replaced already and on being
 * confirmed. A draft never submitted deletes it instead (`removeReceiptFile`).
 */
export async function markReceiptFileReplaced(input: { fileId: string; personId: string }): Promise<{ ok: true } | Refused> {
  const file = await openForOwner({ fileId: input.fileId }, input.personId, "mark");
  if (!file.ok) return file;
  if (!file.value.confirmed) return { ok: false, error: "That file hasn't finished uploading." };
  const { data, error } = await updateReimbursementFiles({ replaced_at: new Date().toISOString(), replaced_by: input.personId })
    .eq("id", file.value.id)
    .is("replaced_at", null)
    .not("confirmed_at", "is", null)
    .select("id");
  if (error) return { ok: false, error: `Could not mark the document replaced: ${error.message}` };
  if ((data ?? []).length === 0) return { ok: false, error: "That document is already replaced." };
  await recordAudit({
    table: "reimbursement_files",
    recordId: file.value.id,
    operation: "update",
    actor: null,
    newData: { replaced: true },
    context: { claimId: file.value.claim.id, itemId: file.value.itemId, move: "replace_document", personId: input.personId },
  });
  return { ok: true };
}

/**
 * A red invoice is a Vietnamese VAT document, so an item bought abroad has
 * none: its red invoices are refiled as receipts. A dropped PDF starts as a
 * red invoice because a dropped receipt starts in Vietnam (claim-items.ts);
 * when the person or the reading then moves the item abroad, the PDF was a
 * receipt all along. On 2026-10-07 a real claim reached its checker with three
 * Australian Uber receipts filed as red invoices this way. The caller has run
 * its guard and decided the item is abroad.
 */
export async function refileAbroadInvoices(input: { itemId: string; claimId: string; personId: string | null }): Promise<{ ok: true } | Refused> {
  const { data, error } = await updateReimbursementFiles({ kind: "receipt" }).eq("claim_item_id", input.itemId).eq("kind", "red_invoice").select("id");
  if (error) return { ok: false, error: `Could not refile the documents: ${error.message}` };
  for (const row of data ?? []) {
    await recordAudit({
      table: "reimbursement_files",
      recordId: String(row.id),
      operation: "update",
      actor: null,
      oldData: { kind: "red_invoice" },
      newData: { kind: "receipt" },
      context: { claimId: input.claimId, itemId: input.itemId, move: "refile_abroad", personId: input.personId },
    });
  }
  return { ok: true };
}

/** A document as a decider's page shows it beside its line: a short inline link, and what it is. */
export type SignedDocument = { url: string; mimeType: string | null };

/**
 * Inline links to every confirmed document of a claim's receipts (a receipt,
 * a red invoice, a bank deduction), by file
 * id, for the checker's page, which shows each one beside its line (plan
 * section 8). Never a bank receipt: that is the payer's, and RB.7's. The
 * caller has run its guard (reimbursements.check); this is not the owner's
 * read, so it is not narrowed to a person. The links last a minute, as every
 * link to this bucket does, which is long enough for the page that asked to
 * load them. A failed read raises: an empty map would show a claim with no
 * receipts, which is what a checker would wrongly send back.
 */
export async function signClaimDocuments(claimId: string): Promise<Map<string, SignedDocument>> {
  const signed = await openDocuments({ claimId }, async (reader) =>
    mustRows(
      await selectReimbursementFiles("id, storage_path, mime_type, reimbursement_claim_items!inner(claim_id)")
        .eq("reimbursement_claim_items.claim_id", reader.claimId)
        .not("confirmed_at", "is", null)
        .in("kind", ITEM_DOCUMENT_KINDS),
      "[reimbursements] a claim's documents for its checker",
    ).map((r) => ({ id: String(r.id), path: String(r.storage_path), mimeType: (r.mime_type as string | null) ?? null })),
  );
  return new Map(signed.map(({ row, url }) => [row.id, { url, mimeType: row.mimeType }]));
}

/**
 * A fresh one-minute link to one confirmed document of a claim's receipts,
 * for a checker who opens it after the page's own links have expired. The file
 * must be on that claim; the caller's guard reaches every claim.
 */
export async function signClaimDocumentDownload(input: { claimId: string; fileId: string }): Promise<{ ok: true; url: string } | Refused> {
  return openDocument({ claimId: input.claimId }, async (reader) => {
    const { data, error } = await selectReimbursementFiles("storage_path, filename, reimbursement_claim_items!inner(claim_id)")
      .eq("id", input.fileId)
      .eq("reimbursement_claim_items.claim_id", reader.claimId)
      .not("confirmed_at", "is", null)
      .in("kind", ITEM_DOCUMENT_KINDS)
      .maybeSingle();
    if (error) return { ok: false, error: `Could not read the file: ${error.message}` };
    if (!data) return { ok: false, error: "File not found." };
    return { ok: true, file: { path: String(data.storage_path), filename: String(data.filename) } };
  });
}

/** A one-minute download link for one of the owner's confirmed documents. */
export async function signReceiptDownload(input: { fileId: string; personId: string }): Promise<{ ok: true; url: string } | Refused> {
  return openDocument({ personId: input.personId }, async (reader) => {
    const file = await openForOwner({ fileId: input.fileId }, reader.personId, "read");
    if (!file.ok) return file;
    if (!file.value.confirmed) return { ok: false, error: "That file hasn't finished uploading." };
    return { ok: true, file: { path: file.value.storagePath, filename: file.value.filename }, asDownload: true };
  });
}
