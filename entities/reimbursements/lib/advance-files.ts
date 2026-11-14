// Evidence on an advance and bank receipts on its transfers (AD.4, design section 5).
// The steps are the document store's (document-store.ts), the same as a claim's; this
// module states the advance's policy: where its rows are kept, who may add which kind
// and when, and who may open one. Until confirm the row is unconfirmed, no screen shows
// it, and a transfer cannot cite it.
//
// The rows are in their own table, so the claim files' guard is not touched. Evidence
// on an advance that was ever submitted is marked replaced rather than deleted, and a
// finished bank receipt is never deleted: the database refuses both.
//
// Not a "use server" file: every caller is an action that has run its guard, and
// these functions take what that guard proved.
import { recordAudit } from "@/kernel/audit/audit";
import { mustRows } from "@/kernel/data/read";
import { canDeleteAdvance, type AdvanceStatus } from "./advance-rules";
import { confirmUpload, discardUpload, openDocument, openDocuments, removeDocument, startUpload, type DocumentRecords } from "./document-store";
import { selectReimbursementAdvanceFiles } from "./reads";
import { deleteReimbursementAdvanceFiles, insertReimbursementAdvanceFiles, updateReimbursementAdvanceFiles } from "./writes";

type AdvanceFileKind = "evidence" | "bank_receipt";
type Refused = { ok: false; error: string };

/** Said when the database keeps evidence the page thought it could delete: the advance was submitted since the page loaded. */
export const KEPT_EVIDENCE = "This advance was submitted before, so its evidence is kept for ten years. Reload the page and remove it again: it will be marked replaced instead.";

/** Where an advance keeps its files' rows, each step scoped to the advance. */
const recordsOf = (advanceId: string): DocumentRecords => ({
  countUnfinished: (since) =>
    selectReimbursementAdvanceFiles("id", { count: "exact", head: true }).eq("advance_id", advanceId).is("confirmed_at", null).gte("created_at", since),
  dropUnfinished: (id) => deleteReimbursementAdvanceFiles().eq("id", id).eq("advance_id", advanceId).is("confirmed_at", null).select("id"),
  saveConfirmed: (id, facts) => updateReimbursementAdvanceFiles(facts).eq("id", id).is("confirmed_at", null).select("id"),
});

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
  const advanceId = input.advance.id;
  return startUpload({
    records: recordsOf(advanceId),
    insert: (file) =>
      insertReimbursementAdvanceFiles({ id: file.id, advance_id: advanceId, kind: input.kind, storage_path: file.path, filename: file.filename, uploaded_by: input.personId }),
    folder: `advance/${advanceId}`,
    holder: "advance",
    declared: input.declared,
  });
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

const stored = (file: FileRow) => ({ id: file.id, path: file.storage_path, filename: file.filename });

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
      await discardUpload(recordsOf(input.advanceId), stored(file));
      return { ok: false, error: refused };
    }
  }
  return confirmUpload({ records: recordsOf(input.advanceId), file: stored(file) });
}

/** Cancel: the browser stopped an upload in flight, and this clears what it left. */
export async function cancelAdvanceUpload(input: { advanceId: string; fileId: string; onlyKind: AdvanceFileKind }): Promise<{ ok: true } | Refused> {
  const read = await readFile(input.advanceId, input.fileId, input.onlyKind);
  if (!read.ok) return read;
  if (!read.file.confirmed_at) await discardUpload(recordsOf(input.advanceId), stored(read.file));
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
    return removeDocument({
      path: file.storage_path,
      deleteRow: () => deleteReimbursementAdvanceFiles().eq("id", file.id).eq("advance_id", advance.id).select("id"),
      kept: KEPT_EVIDENCE,
      missing: "That file is no longer on this advance.",
    });
  }
  const { error } = await updateReimbursementAdvanceFiles({ replaced_at: new Date().toISOString(), replaced_by: input.personId }).eq("id", file.id).is("replaced_at", null).select("id");
  if (error) return { ok: false, error: `Could not set the file aside: ${error.message}` };
  await recordAudit({ table: "reimbursement_advance_files", recordId: file.id, operation: "update", actor: input.actorLabel ?? null, newData: { replaced: true }, context: { advanceId: advance.id } });
  return { ok: true };
}

/**
 * Inline links to the advance's confirmed evidence, by file id, for the approver's page,
 * which shows a photo of the quote beside the amount. Never a bank receipt: that is
 * Finance's. A failed read raises: an empty map would show a request with nothing behind
 * it, which is what an approver would wrongly send back.
 */
export async function signAdvanceEvidence(advanceId: string): Promise<Map<string, string>> {
  const signed = await openDocuments({ advanceId }, async (reader) =>
    mustRows(
      await selectReimbursementAdvanceFiles("id, storage_path").eq("advance_id", reader.advanceId).eq("kind", "evidence").not("confirmed_at", "is", null),
      "[reimbursements] an advance's evidence for its approver",
    ).map((r) => ({ id: String(r.id), path: String(r.storage_path) })),
  );
  return new Map(signed.map(({ row, url }) => [row.id, url]));
}

/**
 * Who is opening an advance's file: the advance their guard proved they may see and, when
 * narrowed, the one kind of file that is theirs (the approver's evidence, Finance's bank receipt).
 */
type AdvanceReader = { advanceId: string; onlyKind?: AdvanceFileKind };

/** A short-lived link to a finished file, for a caller whose guard proved they may see this advance. */
export async function signAdvanceFile(input: { advanceId: string; fileId: string; onlyKind?: AdvanceFileKind }): Promise<{ ok: true; url: string } | Refused> {
  const reader: AdvanceReader = { advanceId: input.advanceId, onlyKind: input.onlyKind };
  return openDocument(reader, async ({ advanceId, onlyKind }) => {
    const read = await readFile(advanceId, input.fileId, onlyKind);
    if (!read.ok) return read;
    if (!read.file.confirmed_at) return { ok: false, error: "That file did not finish uploading." };
    return { ok: true, file: { path: read.file.storage_path, filename: read.file.filename } };
  });
}
