// Receipts and red invoices on a claim item (design §1.4): start an upload,
// confirm it, cancel it, take it off a claim still being written (deleted
// from a draft never submitted, marked replaced on a claim that was: plan
// §10, 20261008090000), and sign a short download link. The file never
// passes through the app: the browser sends it straight to the private
// bucket with a resumable upload carrying the signed token
// `startReceiptUpload` returns (kernel/ui/upload.ts), then asks
// `confirmReceiptUpload` to look at what actually arrived. The shape is
// boards' deliverable files (entities/boards/lib/deliverable-files.ts).
//
// Nothing the browser says about a file is trusted. Start refuses by the
// declared name, size and type so the person hears at once; confirm reads the
// STORED object — its size, its type, its bytes — refuses a red invoice that
// does not start with %PDF- (a photo of a red invoice is a receipt, never a red
// invoice), and records the object's own sha256 for duplicate detection. Until
// confirm, the row is unconfirmed, no screen shows it, and the daily sweep
// (crons/receipt-sweep.ts) clears it.
//
// Not a "use server" file: every caller is an owner action that has already
// run its guard; these functions take the person id that guard proved.
import { supabase } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { recordAudit } from "@/kernel/audit/audit";
import { ownerCan, type ClaimStatus } from "./claim-rules";
import { readOwnFile, readOwnItem, type ClaimRow } from "./own-claims";
import { selectReimbursementFiles } from "./reads";
import { deleteReimbursementFiles, insertReimbursementFiles, updateReimbursementFiles } from "./writes";

export const RECEIPTS_BUCKET = "reimbursement-receipts";
/** The bucket's own limit (25 MB), said here so the person hears it before the upload starts. */
export const MAX_RECEIPT_BYTES = 26_214_400;
/** What the bucket accepts. No SVG or HTML: either can run script when opened. */
export const RECEIPT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
/** A download link lasts a minute: long enough to open, too short to pass around. */
const DOWNLOAD_SECONDS = 60;
/** Unfinished uploads one item may hold from the last day before a new start is refused. */
const MAX_UNFINISHED_PER_ITEM = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DocumentKind = "receipt" | "red_invoice";
type Refused = { ok: false; error: string };

const store = () => supabase.storage.from(RECEIPTS_BUCKET);

/** Why the owner may not change this claim's documents now, or null when they may. */
export function lockedBecause(claim: Pick<ClaimRow, "status" | "submittedAt">): string | null {
  if (ownerCan(claim).edit) return null;
  return claim.status === "submitted" ? "This claim is submitted. Withdraw it to change it." : lockedSentence(claim.status);
}

function lockedSentence(status: ClaimStatus): string {
  return `This claim is ${status.replace("_", " ")}, so its documents are kept as they are.`;
}

const startsWith = (bytes: Uint8Array, sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** Whether an object's first bytes are what its type says. Pure. */
export function bytesMatchType(type: string, head: Uint8Array): boolean {
  switch (type) {
    case "application/pdf":
      return startsWith(head, ascii("%PDF-"));
    case "image/jpeg":
      return startsWith(head, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return startsWith(head, ascii("RIFF")) && startsWith(head, ascii("WEBP"), 8);
    case "image/heic":
    case "image/heif":
      return startsWith(head, ascii("ftyp"), 4);
    default:
      return false;
  }
}

/** The declared file's refusal, said before anything is written; null when it may start. */
function refuseDeclared(kind: DocumentKind, file: { name: string; size: number; type: string }): string | null {
  if (kind === "red_invoice" && file.type !== "application/pdf") {
    return "A red invoice must be a PDF: the seller's e-invoice, or a scan saved as PDF. A photo is a receipt.";
  }
  if (!(RECEIPT_TYPES as readonly string[]).includes(file.type)) return `${file.name} can't be attached. Use a PDF or a photo (JPG, PNG, WebP or HEIC).`;
  if (file.size > MAX_RECEIPT_BYTES) return `${file.name} is over 25 MB. Export a smaller copy.`;
  return null;
}

/** A storage path: the claim's folder, the item's, a random id and a tidy name. */
function receiptPath(claimId: string, itemId: string, fileId: string, name: string): string {
  const tidy = name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) || "file";
  return `claim/${claimId}/${itemId}/${fileId}-${tidy}`;
}

/** Begins an upload: an unconfirmed row and a signed token for its object. */
export async function startReceiptUpload(input: {
  itemId: string;
  kind: DocumentKind;
  personId: string;
  declared: { name: string; size: number; type: string };
}): Promise<{ ok: true; fileId: string; bucket: string; path: string; token: string } | Refused> {
  const item = await readOwnItem(input.itemId, input.personId);
  if (!item.ok) return item;
  const locked = lockedBecause(item.value.claim);
  if (locked) return { ok: false, error: locked };
  if (item.value.removed) return { ok: false, error: "This receipt was removed from the claim. Add a new receipt instead." };
  const refusal = refuseDeclared(input.kind, input.declared);
  if (refusal) return { ok: false, error: refusal };

  // A ceiling on unfinished uploads (boards' K2): each start writes a row, and
  // without one a person could write rows faster than the sweep clears them.
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { count, error: countError } = await selectReimbursementFiles("id")
    .eq("claim_item_id", input.itemId)
    .is("confirmed_at", null)
    .gte("created_at", since);
  // An unread count is not "none": refusing is the safe answer to a failed guard.
  if (countError) return { ok: false, error: "Could not start the upload. Try again." };
  if ((count ?? 0) >= MAX_UNFINISHED_PER_ITEM) return { ok: false, error: "This receipt has too many uploads that haven't finished. Wait a day, then try again." };

  const id = crypto.randomUUID();
  const path = receiptPath(item.value.claim.id, input.itemId, id, input.declared.name);
  const { error } = await insertReimbursementFiles({
    id,
    kind: input.kind,
    claim_item_id: input.itemId,
    storage_path: path,
    filename: input.declared.name.slice(0, 200),
    mime_type: input.declared.type,
    size_bytes: input.declared.size,
    uploaded_by: input.personId,
  });
  if (error) return { ok: false, error: `Could not start the upload: ${error.message}` };

  const { data: signed, error: signError } = await store().createSignedUploadUrl(path);
  if (signError || !signed) {
    // No token, no upload: the row would only wait for the sweep, so it goes now.
    await dropRow(id);
    return { ok: false, error: "Could not start the upload. Try again." };
  }
  return { ok: true, fileId: id, bucket: RECEIPTS_BUCKET, path, token: signed.token };
}

async function dropRow(id: string): Promise<boolean> {
  const { data, error } = await deleteReimbursementFiles().eq("id", id).is("confirmed_at", null).select("id");
  if (error) console.error("[reimbursements] dropping an unfinished upload's row", error.message);
  return !error && (data ?? []).length > 0;
}

/**
 * Removes an upload that will never be confirmed: its row, then its object,
 * and the object only when the row went. The database always lets an
 * unconfirmed row go, whatever its claim (20261008090000), and the delete is
 * guarded on the row still being unconfirmed, so a confirm that landed in
 * between keeps its row and its object both: removing the object first would
 * have left a confirmed document with no file. A failed object removal leaves
 * an object no row names, logged; nothing shows it.
 */
async function discard(id: string, path: string) {
  if (!(await dropRow(id))) return;
  const { error } = await store().remove([path]);
  if (error) console.error("[reimbursements] removing a refused upload's object after its row", error.message);
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Looks at what arrived and either confirms it or refuses and removes it. */
export async function confirmReceiptUpload(input: { fileId: string; personId: string }): Promise<{ ok: true } | Refused> {
  const file = await readOwnFile(input.fileId, input.personId);
  if (!file.ok) return file;
  if (file.value.confirmed) return { ok: true };
  const locked = lockedBecause(file.value.claim);
  if (locked) return { ok: false, error: locked };
  const { storagePath: path, filename: name } = file.value;

  const { data: info, error: infoError } = await store().info(path);
  if (infoError || !info) return { ok: false, error: "The file hasn't arrived yet. Try again in a moment." };
  const size = info.size ?? 0;
  const type = info.contentType ?? "";
  // The whole object is read: its hash is the duplicate check's key (§1.9),
  // and at 25 MB at most it fits the action comfortably.
  const { data: blob, error: readError } = await store().download(path);
  // An unreadable object is "not checked yet", never "not a receipt" (boards'
  // B2): refusing on it would delete a real document on a storage hiccup.
  if (readError || !blob) return { ok: false, error: "Couldn't check the file just now. Try again." };
  const bytes = new Uint8Array(await blob.arrayBuffer());

  const refusal =
    file.value.kind === "red_invoice" && !bytesMatchType("application/pdf", bytes)
      ? `${name} is not a PDF. A red invoice must be the PDF itself, not a photo of it.`
      : !bytesMatchType(type, bytes) || size > MAX_RECEIPT_BYTES
        ? `${name} can't be attached: it is not the PDF or photo it says it is.`
        : null;
  if (refusal) {
    await discard(file.value.id, path);
    return { ok: false, error: refusal };
  }

  // Guarded on still being unconfirmed; matching nothing means a second confirm
  // already landed, which is what was asked for.
  const { error: saveError } = await updateReimbursementFiles({
    confirmed_at: new Date().toISOString(),
    size_bytes: size,
    mime_type: type,
    sha256: await sha256Hex(bytes),
  })
    .eq("id", file.value.id)
    .is("confirmed_at", null)
    .select("id");
  if (saveError) return { ok: false, error: `Could not save the file: ${saveError.message}` };
  return { ok: true };
}

/** Cancel: the browser stopped an upload in flight; this clears what it left. */
export async function cancelReceiptUpload(input: { fileId: string; personId: string }): Promise<{ ok: true } | Refused> {
  const file = await readOwnFile(input.fileId, input.personId);
  if (!file.ok) return file;
  if (!file.value.confirmed) await discard(file.value.id, file.value.storagePath);
  return { ok: true };
}

/** What the owner hears when a document of a claim ever submitted would be deleted. */
const KEPT_DOCUMENT = "This claim was submitted before, so its documents are kept for ten years: mark this one replaced instead, then add the new one.";
/** Postgres's raise_exception: the retention guard refused the delete. */
const GUARD_REFUSED = "P0001";

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
  const file = await readOwnFile(input.fileId, input.personId);
  if (!file.ok) return file;
  const locked = lockedBecause(file.value.claim);
  if (locked) return { ok: false, error: locked };
  if (file.value.confirmed && ownerCan(file.value.claim).remove !== "delete") return { ok: false, error: KEPT_DOCUMENT };
  const { data, error } = await deleteReimbursementFiles().eq("id", file.value.id).select("id");
  if (error) return { ok: false, error: (error as { code?: string }).code === GUARD_REFUSED ? KEPT_DOCUMENT : error.message };
  if ((data ?? []).length === 0) return { ok: false, error: "That file is no longer on the claim." };
  await removeObjects([file.value.storagePath]);
  return { ok: true };
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
  const file = await readOwnFile(input.fileId, input.personId);
  if (!file.ok) return file;
  const locked = lockedBecause(file.value.claim);
  if (locked) return { ok: false, error: locked };
  if (ownerCan(file.value.claim).remove !== "mark") return { ok: false, error: "This draft was never submitted, so the document can simply be removed." };
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

/**
 * Removes objects whose rows are already gone (a removed file, item or draft).
 * A failure leaves an object no row names; it is logged, never shown, because
 * the row — what every screen reads — is already gone.
 */
export async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await store().remove(paths);
  if (error) console.error("[reimbursements] removing objects whose rows are gone", paths.length, error.message);
}

/** A document as a decider's page shows it beside its line: a short inline link, and what it is. */
export type SignedDocument = { url: string; mimeType: string | null };

/**
 * Inline links to every confirmed receipt and red invoice on a claim, by file
 * id, for the checker's page, which shows each one beside its line (plan
 * section 8). Never a bank receipt: that is the payer's, and RB.7's. The
 * caller has run its guard (reimbursements.check); this is not the owner's
 * read, so it is not narrowed to a person. The links last a minute, as every
 * link to this bucket does, which is long enough for the page that asked to
 * load them. A failed read raises: an empty map would show a claim with no
 * receipts, which is what a checker would wrongly send back.
 */
export async function signClaimDocuments(claimId: string): Promise<Map<string, SignedDocument>> {
  const rows = mustRows(
    await selectReimbursementFiles("id, storage_path, mime_type, reimbursement_claim_items!inner(claim_id)")
      .eq("reimbursement_claim_items.claim_id", claimId)
      .not("confirmed_at", "is", null)
      .in("kind", ["receipt", "red_invoice"]),
    "[reimbursements] a claim's documents for its checker",
  );
  const out = new Map<string, SignedDocument>();
  if (rows.length === 0) return out;
  const paths = rows.map((r) => String(r.storage_path));
  const { data, error } = await store().createSignedUrls(paths, DOWNLOAD_SECONDS);
  if (error) throw new Error(`[reimbursements] signing a claim's documents: ${error.message}`);
  const byPath = new Map((data ?? []).map((s) => [s.path, s.signedUrl]));
  for (const r of rows) {
    const url = byPath.get(String(r.storage_path));
    if (url) out.set(String(r.id), { url, mimeType: (r.mime_type as string | null) ?? null });
  }
  return out;
}

/**
 * A fresh one-minute link to one confirmed receipt or red invoice of a claim,
 * for a checker who opens it after the page's own links have expired. The file
 * must be on that claim; the caller's guard reaches every claim.
 */
export async function signClaimDocumentDownload(input: { claimId: string; fileId: string }): Promise<{ ok: true; url: string } | Refused> {
  const { data, error } = await selectReimbursementFiles("storage_path, filename, reimbursement_claim_items!inner(claim_id)")
    .eq("id", input.fileId)
    .eq("reimbursement_claim_items.claim_id", input.claimId)
    .not("confirmed_at", "is", null)
    .in("kind", ["receipt", "red_invoice"])
    .maybeSingle();
  if (error) return { ok: false, error: `Could not read the file: ${error.message}` };
  if (!data) return { ok: false, error: "File not found." };
  const signed = await store().createSignedUrl(String(data.storage_path), DOWNLOAD_SECONDS);
  if (signed.error || !signed.data) return { ok: false, error: "Could not open the file. Try again." };
  return { ok: true, url: signed.data.signedUrl };
}

/** A one-minute download link for one of the owner's confirmed documents. */
export async function signReceiptDownload(input: { fileId: string; personId: string }): Promise<{ ok: true; url: string } | Refused> {
  const file = await readOwnFile(input.fileId, input.personId);
  if (!file.ok) return file;
  if (!file.value.confirmed) return { ok: false, error: "That file hasn't finished uploading." };
  const { data, error } = await store().createSignedUrl(file.value.storagePath, DOWNLOAD_SECONDS, { download: file.value.filename });
  if (error || !data) return { ok: false, error: "Could not open the file. Try again." };
  return { ok: true, url: data.signedUrl };
}
