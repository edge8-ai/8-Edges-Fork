// The document store (RB.30): the one module in Reimbursements that runs the steps every
// document takes in the private bucket. A claim's receipts, an advance's evidence and a
// payment's bank receipt all go the same way: start an upload, confirm it by what arrived,
// discard one that will never be confirmed, take one off, and open one.
//
// The browser sends a file straight to the bucket with a signed token, then asks confirm to
// look at what actually arrived. Nothing the browser says about a file is trusted: start
// refuses by the declared type and size so the person hears at once, and confirm reads the
// stored object's size, type and bytes and records its own hash.
//
// Each owner states only its policy: where its rows are kept (`DocumentRecords`), the kinds
// it takes, and who may open one. A link handed to anyone is made only by `openDocument` and
// `openDocuments`, which take the reader and the owner's rule for who may open, so no caller
// can be given a link signed from a path alone. Two steps take a bare path and stay on this
// server: `readDocumentBytes` (the receipt reader) and `streamDocument` (the month's export),
// whose link is fetched here at once and never returned.
//
// It lives in Reimbursements, not the kernel: the target architecture names a platform
// documents block, and this is shaped to be lifted there when a second entity needs it.
import { supabase } from "@/kernel/data/supabase";

const RECEIPTS_BUCKET = "reimbursement-receipts";
/** The bucket's own limit (25 MB), said here so the person hears it before the upload starts. */
const MAX_RECEIPT_BYTES = 26_214_400;
/** What the bucket accepts. No SVG or HTML: either can run script when opened. */
const RECEIPT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
/** A link lasts a minute: long enough to open, too short to pass around. */
const LINK_SECONDS = 60;
/** Unfinished uploads one holder may have from the last day before a new start is refused. */
const MAX_UNFINISHED = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Postgres's raise_exception: a retention guard refused the delete. */
const GUARD_REFUSED = "P0001";
const START_FAILED = "Could not start the upload. Try again.";

type Refused = { ok: false; error: string };
type DbError = { message: string; code?: string } | null;

/**
 * Where an owner keeps its documents' rows. The store decides the steps; the owner's table
 * answers them, each scoped to the owner's own thing.
 */
export type DocumentRecords = {
  /** Unfinished uploads on the owner's thing started since a moment, counted by the database (`{ count: "exact", head: true }`). */
  countUnfinished(since: string): PromiseLike<{ count: number | null; error: DbError }>;
  /**
   * Deletes a row while it is still unconfirmed, returning the rows it deleted. Absent when the
   * owner's rows are never deleted (a payment's bank receipt): a discard then removes only the
   * object, and the unconfirmed row stays where no screen shows it.
   */
  dropUnfinished?(id: string): PromiseLike<{ data: unknown[] | null; error: DbError }>;
  /** Saves what confirm read, guarded on the row still being unconfirmed. */
  saveConfirmed(id: string, facts: { confirmed_at: string; size_bytes: number; mime_type: string; sha256: string }): PromiseLike<{ error: DbError }>;
};

/** A stored document as the store needs it: its row, its object, and the name the person gave it. */
type StoredFile = { id: string; path: string; filename: string };

/** What a document's ceiling counts on, named in its refusal: a claim's receipt, an advance, a payment. */
type Holder = "receipt" | "advance" | "payment";

/** How an owner names the files it takes, in its refusals: "Use {use}." and "it is not the {isNot} it says it is." */
type Wording = { use: string; isNot: string };
const PHOTOS: Wording = { use: "a PDF or a photo (JPG, PNG, WebP or HEIC)", isNot: "PDF or photo" };

const store = () => supabase.storage.from(RECEIPTS_BUCKET);

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

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A name safe in a storage path: letters, digits, dots and dashes, the last 80 of them. */
function tidyName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) || "file";
}

/** The declared file's refusal, said before anything is written; null when it may start. */
function refuseDeclared(file: { name: string; size: number; type: string }, wording: Wording): string | null {
  if (!(RECEIPT_TYPES as readonly string[]).includes(file.type)) return `${file.name} can't be attached. Use ${wording.use}.`;
  if (file.size > MAX_RECEIPT_BYTES) return `${file.name} is over 25 MB. Export a smaller copy.`;
  return null;
}

/**
 * Begins an upload: an unconfirmed row and a signed token for its object. The owner has
 * already said whether its thing takes a file now; this refuses by the declared file and by
 * the ceiling, which stops a stuck upload loop writing rows faster than the sweep clears them.
 */
export async function startUpload(input: {
  records: DocumentRecords;
  /** Writes the owner's unconfirmed row for this object. */
  insert: (file: StoredFile) => PromiseLike<{ error: DbError }>;
  /** The owner's folder in the bucket, such as `advance/<id>`. */
  folder: string;
  /** What the ceiling counts on, named in its refusal. */
  holder: Holder;
  declared: { name: string; size: number; type: string };
  wording?: Wording;
}): Promise<{ ok: true; fileId: string; bucket: string; path: string; token: string } | Refused> {
  const refusal = refuseDeclared(input.declared, input.wording ?? PHOTOS);
  if (refusal) return { ok: false, error: refusal };

  const { count, error: countError } = await input.records.countUnfinished(new Date(Date.now() - DAY_MS).toISOString());
  // An unread count is not "none": refusing is the safe answer to a failed guard. A count of
  // null with no error means the read never asked for one, which is the same failure.
  if (countError || count === null) return { ok: false, error: START_FAILED };
  if (count >= MAX_UNFINISHED) return { ok: false, error: `This ${input.holder} has too many uploads that haven't finished. Wait a day, then try again.` };

  const fileId = crypto.randomUUID();
  const path = `${input.folder}/${fileId}-${tidyName(input.declared.name)}`;
  const { error } = await input.insert({ id: fileId, path, filename: input.declared.name.slice(0, 200) });
  if (error) return { ok: false, error: `Could not start the upload: ${error.message}` };
  const { data: signed, error: signError } = await store().createSignedUploadUrl(path);
  if (signError || !signed) {
    // No token, no upload: the row would only wait for the sweep, so it goes now. An owner
    // whose rows are kept leaves it unconfirmed, used by nothing.
    if (input.records.dropUnfinished) await dropRow(input.records.dropUnfinished, fileId);
    return { ok: false, error: START_FAILED };
  }
  return { ok: true, fileId, bucket: RECEIPTS_BUCKET, path, token: signed.token };
}

async function dropRow(drop: NonNullable<DocumentRecords["dropUnfinished"]>, id: string): Promise<boolean> {
  const { data, error } = await drop(id);
  if (error) console.error("[reimbursements] dropping an unfinished upload's row", error.message);
  return !error && (data ?? []).length > 0;
}

/**
 * Removes an upload that will never be confirmed: its row, then its object, and the object
 * only when the row went. The delete is guarded on the row still being unconfirmed, so a
 * confirm that landed in between keeps its row and its object both: removing the object
 * first would have left a confirmed document with no file. A failed object removal leaves
 * an object no row names, logged; nothing shows it. An owner whose rows are kept loses
 * only the object.
 */
export async function discardUpload(records: DocumentRecords, file: Pick<StoredFile, "id" | "path">): Promise<void> {
  if (records.dropUnfinished && !(await dropRow(records.dropUnfinished, file.id))) return;
  const { error } = await store().remove([file.path]);
  if (error) console.error("[reimbursements] removing a refused upload's object after its row", error.message);
}

/**
 * Looks at what arrived and either confirms it or refuses and removes it. `pdfOnly` is an
 * owner's rule that the bytes be a PDF whatever was declared (a red invoice), with its
 * sentence. The whole object is read: its hash is the duplicate check's key, and at 25 MB at
 * most it fits an action comfortably.
 */
export async function confirmUpload(input: { records: DocumentRecords; file: StoredFile; pdfOnly?: string | null; wording?: Wording }): Promise<{ ok: true } | Refused> {
  const { records, file } = input;
  const { data: info, error: infoError } = await store().info(file.path);
  if (infoError || !info) return { ok: false, error: "The file hasn't arrived yet. Try again in a moment." };
  const size = info.size ?? 0;
  const type = info.contentType ?? "";
  const { data: blob, error: readError } = await store().download(file.path);
  // An unreadable object is "not checked yet", never "not a document": refusing on it
  // would delete a real file on a storage hiccup.
  if (readError || !blob) return { ok: false, error: "Couldn't check the file just now. Try again." };
  const bytes = new Uint8Array(await blob.arrayBuffer());

  const refusal =
    input.pdfOnly && !bytesMatchType("application/pdf", bytes)
      ? input.pdfOnly
      : !bytesMatchType(type, bytes) || size > MAX_RECEIPT_BYTES
        ? `${file.filename} can't be attached: it is not the ${(input.wording ?? PHOTOS).isNot} it says it is.`
        : null;
  if (refusal) {
    await discardUpload(records, file);
    return { ok: false, error: refusal };
  }
  // Guarded on still being unconfirmed; matching nothing means a second confirm already
  // landed, which is what was asked for.
  const { error } = await records.saveConfirmed(file.id, { confirmed_at: new Date().toISOString(), size_bytes: size, mime_type: type, sha256: await sha256Hex(bytes) });
  if (error) return { ok: false, error: `Could not save the file: ${error.message}` };
  return { ok: true };
}

/**
 * Takes a document off: its row, then its object. The row goes first because the database
 * decides: a retention guard refuses the delete of a kept document, and an object removed
 * before a refused delete would be a kept record with no file. That refusal is answered in
 * the owner's plain words (`kept`), never the database's.
 */
export async function removeDocument(input: {
  path: string;
  deleteRow: () => PromiseLike<{ data: unknown[] | null; error: DbError }>;
  /** The owner's sentence for a document the database keeps. */
  kept: string;
  /** The owner's sentence for a row that was already gone. */
  missing: string;
}): Promise<{ ok: true } | Refused> {
  const { data, error } = await input.deleteRow();
  if (error) return { ok: false, error: error.code === GUARD_REFUSED ? input.kept : `Could not remove the file: ${error.message}` };
  // No rows back is "already gone", whether the answer is an empty list or nothing at all:
  // removing the object on an answer that names no row could leave a kept record with no file.
  if ((data ?? []).length === 0) return { ok: false, error: input.missing };
  await removeObjects([input.path]);
  return { ok: true };
}

/**
 * Removes objects whose rows are already gone (a removed file, item or draft). A failure
 * leaves an object no row names; it is logged, never shown, because the row — what every
 * screen reads — is already gone.
 */
export async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await store().remove(paths);
  if (error) console.error("[reimbursements] removing objects whose rows are gone", paths.length, error.message);
}

/** The owner's answer to "may this reader open it": the document, or the refusal the reader hears. */
type Opening = { ok: true; file: { path: string; filename: string }; asDownload?: boolean } | Refused;

/**
 * A one-minute link to one document, for a reader the owner's rule lets open it. The rule
 * finds the document for that reader; a refusal signs nothing.
 */
export async function openDocument<Reader>(reader: Reader, mayOpen: (reader: Reader) => Promise<Opening>): Promise<{ ok: true; url: string } | Refused> {
  const found = await mayOpen(reader);
  if (!found.ok) return found;
  const { path, filename } = found.file;
  const { data, error } = found.asDownload ? await store().createSignedUrl(path, LINK_SECONDS, { download: filename }) : await store().createSignedUrl(path, LINK_SECONDS);
  if (error || !data) return { ok: false, error: "Could not open the file. Try again." };
  return { ok: true, url: data.signedUrl };
}

/**
 * Inline links to every document the owner's rule lists for this reader, each paired with
 * its row, for a page that shows them beside what they prove. A failed signing raises: an
 * empty list would show a request with nothing behind it, which a decider would wrongly
 * send back. A row the bucket did not sign is left out.
 */
export async function openDocuments<Reader, Row extends { path: string }>(reader: Reader, mayList: (reader: Reader) => Promise<Row[]>): Promise<Array<{ row: Row; url: string }>> {
  const rows = await mayList(reader);
  if (rows.length === 0) return [];
  const { data, error } = await store().createSignedUrls(
    rows.map((r) => r.path),
    LINK_SECONDS,
  );
  if (error) throw new Error(`[reimbursements] signing documents: ${error.message}`);
  const byPath = new Map((data ?? []).map((s) => [s.path, s.signedUrl]));
  return rows.flatMap((row) => {
    const url = byPath.get(row.path);
    return url ? [{ row, url }] : [];
  });
}

/**
 * A stored document's bytes, for a reader that has already found the file through its owner's
 * rule (the receipt reader, after confirm). Null when the bucket could not give them: the
 * caller says so, never "nothing legible".
 */
export async function readDocumentBytes(path: string): Promise<Uint8Array | null> {
  const { data: blob, error } = await store().download(path);
  if (error || !blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * A stored document as a stream, for the month's export, which streams each entry into its zip
 * as the zip reaches it. The link is used at once by this server and never handed to anyone,
 * so a bundle that takes minutes never holds an expired link or a whole file. Null when the
 * document could not be read.
 */
export async function streamDocument(path: string): Promise<ReadableStream<Uint8Array> | null> {
  const { data, error } = await store().createSignedUrl(path, LINK_SECONDS);
  if (error || !data) return null;
  const res = await fetch(data.signedUrl, { cache: "no-store" });
  return res.ok && res.body ? res.body : null;
}

/** What the nightly sweep did with one stale upload. */
type Swept = { done: "swept" | "kept" | "gone" } | { done: "failed"; what: "row" | "object"; message: string };

/**
 * Clears one upload that was never confirmed, for the nightly sweep of every owner's rows: the
 * row first, its delete re-checking what selected it, and the object only once the row went. A
 * row the retention guard refuses is kept with its object, because the database has said the
 * record stays; a removed object under a refused row would be a kept record with no document.
 */
export async function sweepUpload(path: string, deleteRow: () => PromiseLike<{ data: unknown[] | null; error: DbError }>): Promise<Swept> {
  const { data, error } = await deleteRow();
  if (error) return error.code === GUARD_REFUSED ? { done: "kept" } : { done: "failed", what: "row", message: error.message };
  // Confirmed, or gone, since it was read: not this sweep's to touch.
  if ((data ?? []).length === 0) return { done: "gone" };
  const { error: removeError } = await store().remove([path]);
  return removeError ? { done: "failed", what: "object", message: removeError.message } : { done: "swept" };
}
