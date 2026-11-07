// Evidence on an advance and bank receipts on its transfers (AD.4, design section 5),
// in the same private bucket and with the same protocol as a claim's documents: the
// browser sends the file straight to the bucket with a signed token, then confirm
// looks at what actually arrived. Nothing the browser says about a file is trusted.
// Until confirm the row is unconfirmed, no screen shows it, and a transfer cannot cite it.
//
// The rows are in their own table, so the claim files' guard is not touched. Evidence
// on an advance that was ever submitted is marked replaced rather than deleted, and a
// finished bank receipt is never deleted: the database refuses both.
//
// Not a "use server" file: every caller is an action that has run its guard, and
// these functions take what that guard proved.
import { recordAudit } from "@/kernel/audit/audit";
import { mustRows } from "@/kernel/data/read";
import { supabase } from "@/kernel/data/supabase";
import { canDeleteAdvance, type AdvanceStatus } from "./advance-rules";
import { bytesMatchType, MAX_RECEIPT_BYTES, RECEIPT_TYPES, RECEIPTS_BUCKET, sha256Hex } from "./claim-files";
import { selectReimbursementAdvanceFiles } from "./reads";
import { deleteReimbursementAdvanceFiles, insertReimbursementAdvanceFiles, updateReimbursementAdvanceFiles } from "./writes";

type AdvanceFileKind = "evidence" | "bank_receipt";
type Refused = { ok: false; error: string };

/** A download link lasts a minute: long enough to open, too short to pass around. */
const DOWNLOAD_SECONDS = 60;

const store = () => supabase.storage.from(RECEIPTS_BUCKET);

/** A storage path under the advance's own folder: a random id and a tidy name. */
function advanceFilePath(advanceId: string, fileId: string, name: string): string {
  const tidy = name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) || "file";
  return `advance/${advanceId}/${fileId}-${tidy}`;
}

/** Who may add what, and when: the owner adds evidence while it is theirs to change, Finance a bank receipt while money is moving. */
function startRefusal(kind: AdvanceFileKind, status: AdvanceStatus): string | null {
  if (kind === "evidence") return status === "draft" || status === "sent_back" ? null : "This advance is with the approver now, so its evidence can no longer change.";
  return status === "approved" || status === "to_return" ? null : "A bank receipt goes on an advance while its money is moving.";
}

/** Begins an upload: an unconfirmed row and a signed token for its object. */
export async function startAdvanceUpload(input: {
  advance: { id: string; status: AdvanceStatus };
  kind: AdvanceFileKind;
  personId: string;
  declared: { name: string; size: number; type: string };
}): Promise<{ ok: true; fileId: string; bucket: string; path: string; token: string } | Refused> {
  const refused = startRefusal(input.kind, input.advance.status);
  if (refused) return { ok: false, error: refused };
  const { name, size, type } = input.declared;
  if (!(RECEIPT_TYPES as readonly string[]).includes(type)) return { ok: false, error: `${name} can't be attached. Use a PDF or a photo.` };
  if (size > MAX_RECEIPT_BYTES) return { ok: false, error: `${name} is over 25 MB. Export a smaller copy.` };

  const fileId = crypto.randomUUID();
  const path = advanceFilePath(input.advance.id, fileId, name);
  const { error } = await insertReimbursementAdvanceFiles({
    id: fileId,
    advance_id: input.advance.id,
    kind: input.kind,
    storage_path: path,
    filename: name.slice(0, 200),
    uploaded_by: input.personId,
  });
  if (error) return { ok: false, error: `Could not start the upload: ${error.message}` };
  const { data: signed, error: signError } = await store().createSignedUploadUrl(path);
  if (signError || !signed) {
    await deleteReimbursementAdvanceFiles().eq("id", fileId).is("confirmed_at", null);
    return { ok: false, error: `Could not start the upload: ${signError?.message ?? "no token"}` };
  }
  return { ok: true, fileId, bucket: RECEIPTS_BUCKET, path, token: signed.token };
}

type FileRow = { id: string; storage_path: string; filename: string; kind: AdvanceFileKind; confirmed_at: string | null };

/**
 * One file on this advance. `onlyKind` limits a caller to the files that are theirs: the owner's
 * evidence, or Finance's bank receipt. Any other reads as a missing file, so a caller learns
 * nothing about it and cannot finish or drop someone else's upload.
 */
async function readFile(advanceId: string, fileId: string, onlyKind?: AdvanceFileKind): Promise<{ ok: true; file: FileRow } | Refused> {
  const { data, error } = await selectReimbursementAdvanceFiles("id, storage_path, filename, kind, confirmed_at").eq("id", fileId).eq("advance_id", advanceId).maybeSingle();
  if (error) return { ok: false, error: `Could not read the file: ${error.message}` };
  const file = data as unknown as FileRow | null;
  return file && (!onlyKind || file.kind === onlyKind) ? { ok: true, file } : { ok: false, error: "That file is no longer on this advance." };
}

/** Removes an upload that will never be confirmed: its row, then its object, and the object only when the row went. */
async function discard(file: { id: string; storage_path: string }): Promise<void> {
  const { data, error } = await deleteReimbursementAdvanceFiles().eq("id", file.id).is("confirmed_at", null).select("id");
  if (error) console.error("[reimbursements] dropping an unfinished advance upload's row", error.message);
  if (error || !data?.length) return;
  const { error: removeError } = await store().remove([file.storage_path]);
  if (removeError) console.error("[reimbursements] removing a refused advance upload's object", removeError.message);
}

/** Looks at what arrived and either confirms it or refuses and removes it. */
export async function confirmAdvanceUpload(
  input: { advanceId: string; fileId: string } & ({ onlyKind: "evidence"; status: AdvanceStatus } | { onlyKind: "bank_receipt" }),
): Promise<{ ok: true } | Refused> {
  const read = await readFile(input.advanceId, input.fileId, input.onlyKind);
  if (!read.ok) return read;
  const { file } = read;
  if (file.confirmed_at) return { ok: true };
  // Starting the upload was checked, but it can finish later. Evidence finished after the request
  // was sent would sit beside what the approver read as if they had read it.
  if (input.onlyKind === "evidence") {
    const refused = startRefusal("evidence", input.status);
    if (refused) {
      await discard(file);
      return { ok: false, error: refused };
    }
  }

  const { data: info, error: infoError } = await store().info(file.storage_path);
  if (infoError || !info) return { ok: false, error: "The file hasn't arrived yet. Try again in a moment." };
  const size = info.size ?? 0;
  const type = info.contentType ?? "";
  const { data: blob, error: readError } = await store().download(file.storage_path);
  // An unreadable object is "not checked yet", never "not a document": refusing on
  // it would delete a real file on a storage hiccup.
  if (readError || !blob) return { ok: false, error: "Couldn't check the file just now. Try again." };
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!bytesMatchType(type, bytes) || size > MAX_RECEIPT_BYTES) {
    await discard(file);
    return { ok: false, error: `${file.filename} can't be attached: it is not the PDF or photo it says it is.` };
  }
  // Guarded on still being unconfirmed; matching nothing means a second confirm
  // already landed, which is what was asked for.
  const { error } = await updateReimbursementAdvanceFiles({
    confirmed_at: new Date().toISOString(),
    size_bytes: size,
    mime_type: type,
    sha256: await sha256Hex(bytes),
  })
    .eq("id", file.id)
    .is("confirmed_at", null)
    .select("id");
  if (error) return { ok: false, error: `Could not save the file: ${error.message}` };
  return { ok: true };
}

/** Cancel: the browser stopped an upload in flight, and this clears what it left. */
export async function cancelAdvanceUpload(input: { advanceId: string; fileId: string; onlyKind: AdvanceFileKind }): Promise<{ ok: true } | Refused> {
  const read = await readFile(input.advanceId, input.fileId, input.onlyKind);
  if (!read.ok) return read;
  if (!read.file.confirmed_at) await discard(read.file);
  return { ok: true };
}

/**
 * Takes evidence off a draft that was never submitted: the row, then the object. From
 * one that was, it is marked replaced instead, because it was part of what the approver
 * read and is kept. A bank receipt is neither.
 */
export async function removeAdvanceEvidence(input: {
  advance: { id: string; status: AdvanceStatus; submittedAt: string | null };
  fileId: string;
  personId: string;
  actorLabel?: string | null;
}): Promise<{ ok: true } | Refused> {
  const { advance } = input;
  const read = await readFile(advance.id, input.fileId);
  if (!read.ok) return read;
  const { file } = read;
  if (file.kind !== "evidence") return { ok: false, error: "A bank receipt is kept." };
  if (advance.status !== "draft" && advance.status !== "sent_back") return { ok: false, error: "This advance is with the approver now, so its evidence can no longer change." };

  if (canDeleteAdvance(advance) || !file.confirmed_at) {
    const { error } = await deleteReimbursementAdvanceFiles().eq("id", file.id);
    if (error) return { ok: false, error: `Could not remove the file: ${error.message}` };
    const { error: removeError } = await store().remove([file.storage_path]);
    if (removeError) console.error("[reimbursements] removing an advance file's object", removeError.message);
    return { ok: true };
  }
  const { error } = await updateReimbursementAdvanceFiles({ replaced_at: new Date().toISOString(), replaced_by: input.personId }).eq("id", file.id).is("replaced_at", null).select("id");
  if (error) return { ok: false, error: `Could not set the file aside: ${error.message}` };
  await recordAudit({ table: "reimbursement_advance_files", recordId: file.id, operation: "update", actor: input.actorLabel ?? null, newData: { replaced: true }, context: { advanceId: advance.id } });
  return { ok: true };
}

/** A short-lived link to a finished file, for a caller whose guard proved they may see this advance. */
/**
 * Inline links to the advance's confirmed evidence, by file id, for the approver's page,
 * which shows a photo of the quote beside the amount. Never a bank receipt: that is
 * Finance's. A failed read raises: an empty map would show a request with nothing behind
 * it, which is what an approver would wrongly send back.
 */
export async function signAdvanceEvidence(advanceId: string): Promise<Map<string, string>> {
  const rows = mustRows(
    await selectReimbursementAdvanceFiles("id, storage_path").eq("advance_id", advanceId).eq("kind", "evidence").not("confirmed_at", "is", null),
    "[reimbursements] an advance's evidence for its approver",
  );
  const out = new Map<string, string>();
  if (rows.length === 0) return out;
  const { data, error } = await store().createSignedUrls(rows.map((r) => String(r.storage_path)), DOWNLOAD_SECONDS);
  if (error) throw new Error(`[reimbursements] signing an advance's evidence: ${error.message}`);
  const byPath = new Map((data ?? []).map((s) => [s.path, s.signedUrl]));
  for (const r of rows) {
    const url = byPath.get(String(r.storage_path));
    if (url) out.set(String(r.id), url);
  }
  return out;
}

export async function signAdvanceFile(input: { advanceId: string; fileId: string; onlyKind?: AdvanceFileKind }): Promise<{ ok: true; url: string } | Refused> {
  const read = await readFile(input.advanceId, input.fileId, input.onlyKind);
  if (!read.ok) return read;
  if (!read.file.confirmed_at) return { ok: false, error: "That file did not finish uploading." };
  const { data, error } = await store().createSignedUrl(read.file.storage_path, DOWNLOAD_SECONDS);
  if (error || !data) return { ok: false, error: `Could not open the file: ${error?.message ?? "no link"}` };
  return { ok: true, url: data.signedUrl };
}
