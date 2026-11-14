"use server";

// File deliverables (W.128): start an upload, confirm it, cancel it, and sign a
// download. The file itself never passes through the app: the browser sends it
// straight to the private card-attachments bucket with a resumable (TUS)
// upload carrying the signed token `startCardUpload` returns, then asks
// `confirmCardUpload` to look at what actually arrived.
//
// Nothing the browser says about a file is trusted. Start refuses by the
// declared name, size and type so a person hears at once; confirm reads the
// STORED object's size and type, and an image's first bytes, and deletes the
// file and its row if any of them breaks the rules. Until confirm, the row is
// unconfirmed and no list shows it; the daily sweep (W.157) clears any left.

import { companyOs, supabase } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { boardMutation } from "./mutation";
import { DELIVERABLES_BUCKET, FILE_TYPES, MAX_FILE_BYTES, deliverablePath, imageBytesMatch, isImageType, isVideoType, normaliseFileType, PREVIEW_SECONDS, refuseFile, VIDEO_SECONDS, type FileRefusal } from "./deliverable-rules";
import { DELIVERABLE_COLUMNS, shapeDeliverable, type DeliverableRow } from "./deliverable-shape";
import type { Deliverable } from "./deliverable-types";

type Refused = { ok: false; error: string; refusal?: FileRefusal };

/** How long a download link lasts once asked for. */
const DOWNLOAD_SECONDS = 300;
/** Unconfirmed uploads one card may hold from the last day before a new start is refused. */
const MAX_UNFINISHED_UPLOADS = 50;
const UNFINISHED_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Begins an upload: an unconfirmed row and a signed token for its object. */
export async function startCardUpload(
  taskId: string,
  declared: { name: string; size: number; type: string },
): Promise<{ ok: true; deliverableId: string; bucket: string; path: string; token: string } | Refused> {
  const gate = await boardMutation({ table: "tasks", id: taskId, label: "card" });
  if (!gate.ok) return gate;
  // The client normalises the type already (bug hunt B3), but a page loaded
  // before that fix still sends Windows' alias for a zip or an empty type for
  // a HEIC, and the bucket would refuse the bytes after the row was written.
  const file = { ...declared, type: normaliseFileType(declared) };
  const refusal = refuseFile(file);
  if (refusal) return { ok: false, error: `${refusal.title}. ${refusal.detail}`, refusal };

  // A ceiling on unfinished uploads per card (bug hunt K2, W.163): each start
  // writes a row, and without one a board member could write rows faster than
  // the sweep clears them. Uploads that finish are confirmed and stop
  // counting, so only work in flight or abandoned within the day counts. The
  // drawer starts every dropped file at once, so the ceiling sits well above
  // a large drop. Starts racing each other can pass it by a few; it bounds
  // abuse, it is not an exact quota.
  const since = new Date(Date.now() - UNFINISHED_WINDOW_MS).toISOString();
  const { count: unfinished, error: countError } = await companyOs
    .from("task_attachments")
    .select("id", { count: "exact", head: true })
    .eq("task_id", taskId)
    .eq("kind", "file")
    .is("confirmed_at", null)
    .gte("created_at", since);
  // An unread count is not "none": refusing is the safe answer to a failed guard.
  if (countError) return { ok: false, error: "Could not start the upload. Try again." };
  if ((unfinished ?? 0) >= MAX_UNFINISHED_UPLOADS) {
    return {
      ok: false,
      error: `This card already has ${MAX_UNFINISHED_UPLOADS} uploads that haven't finished. Let them finish, or wait a day, then try again.`,
    };
  }

  const id = crypto.randomUUID();
  const path = deliverablePath(taskId, file.name, id);
  const { error } = await companyOs.from("task_attachments").insert({
    id,
    task_id: taskId,
    kind: "file",
    storage_path: path,
    filename: file.name.slice(0, 200),
    mime_type: file.type,
    size_bytes: file.size,
    uploaded_by: gate.actor.personId,
  });
  if (error) return { ok: false, error: `Could not start the upload: ${error.message}` };

  const { data: signed, error: signError } = await supabase.storage.from(DELIVERABLES_BUCKET).createSignedUploadUrl(path);
  if (signError || !signed) {
    // No token, no upload: the row would only wait for the sweep, so it goes now.
    const { error: dropError } = await companyOs.from("task_attachments").delete().eq("id", id).is("confirmed_at", null);
    if (dropError) console.error("[boards] dropping an unstarted upload", dropError.message);
    return { ok: false, error: "Could not start the upload. Try again." };
  }
  return { ok: true, deliverableId: id, bucket: DELIVERABLES_BUCKET, path, token: signed.token };
}

/** The first bytes of a stored object, to check that an image is one. */
async function headBytes(path: string): Promise<Uint8Array | null> {
  const { data, error } = await supabase.storage.from(DELIVERABLES_BUCKET).createSignedUrl(path, 60);
  if (error || !data) return null;
  const res = await fetch(data.signedUrl, { headers: { Range: "bytes=0-31" } }).catch(() => null);
  if (!res || !res.ok) return null;
  return new Uint8Array(await res.arrayBuffer()).slice(0, 32);
}

/**
 * Removes an upload that will never be confirmed: its object, then its row.
 * The row goes only when the object did (bug hunt F1, W.163). A row deleted
 * after a failed removal left an object no row names in a live card's folder;
 * kept, the row is an unconfirmed upload the daily sweep removes, object
 * first, the next night.
 */
async function discard(id: string, path: string) {
  const { error: removeError } = await supabase.storage.from(DELIVERABLES_BUCKET).remove([path]);
  if (removeError) {
    console.error("[boards] removing a refused upload; its row stays for the sweep", removeError.message);
    return;
  }
  const { error } = await companyOs.from("task_attachments").delete().eq("id", id).is("confirmed_at", null);
  if (error) console.error("[boards] deleting a refused upload's row", error.message);
}

/**
 * Looks at what arrived and either confirms it or refuses it. The stored size
 * and type are the ones recorded, not the ones the browser declared.
 */
export async function confirmCardUpload(taskId: string, deliverableId: string): Promise<{ ok: true; item: Deliverable } | Refused> {
  const gate = await boardMutation({ table: "tasks", id: taskId, label: "card" });
  if (!gate.ok) return gate;
  const { data: row, error } = await companyOs
    .from("task_attachments")
    .select("id, storage_path, filename")
    .eq("id", deliverableId)
    .eq("task_id", taskId)
    .eq("kind", "file")
    .is("confirmed_at", null)
    .maybeSingle();
  if (error) return { ok: false, error: `Could not check the upload: ${error.message}` };
  if (!row?.storage_path) return { ok: false, error: "That upload is no longer waiting to be confirmed." };
  const path = row.storage_path;
  const name = row.filename ?? "The file";

  const { data: info, error: infoError } = await supabase.storage.from(DELIVERABLES_BUCKET).info(path);
  if (infoError || !info) return { ok: false, error: "The file hasn't arrived yet. Try again in a moment." };
  const size = info.size ?? 0;
  const type = info.contentType ?? "";
  let refusal: FileRefusal | null = size > MAX_FILE_BYTES || !FILE_TYPES[type] ? refuseFile({ name, size, type }) : null;
  if (!refusal && isImageType(type)) {
    const head = await headBytes(path);
    // An unreadable head is "not checked yet", never "not an image" (bug hunt
    // B2): refusing on it deleted real images on a storage hiccup. The row and
    // the object stay unconfirmed and the person can confirm again.
    if (!head) return { ok: false, error: "Couldn't check the file just now. Try again." };
    if (!imageBytesMatch(type, head)) {
      refusal = { reason: "type", title: `${name} can't be attached`, detail: "It says it is an image but isn't one. Export it again as PNG or JPG." };
    }
  }
  if (refusal) {
    await discard(deliverableId, path);
    return { ok: false, error: `${refusal.title}. ${refusal.detail}`, refusal };
  }

  const { data: saved, error: saveError } = await companyOs
    .from("task_attachments")
    .update({ confirmed_at: new Date().toISOString(), size_bytes: size, mime_type: type })
    .eq("id", deliverableId)
    .is("confirmed_at", null)
    .select(DELIVERABLE_COLUMNS)
    .single();
  if (saveError || !saved) return { ok: false, error: `Could not save the file: ${saveError?.message ?? "no row"}` };
  await recordAudit({ table: "task_attachments", recordId: deliverableId, operation: "update", actor: gate.actor.label, newData: { confirmed: true, filename: name, size_bytes: size, mime_type: type } });

  let previewUrl: string | null = null;
  if (isImageType(type) || isVideoType(type)) {
    const seconds = isVideoType(type) ? VIDEO_SECONDS : PREVIEW_SECONDS;
    const { data: signed, error: signError } = await supabase.storage.from(DELIVERABLES_BUCKET).createSignedUrl(path, seconds);
    if (signError) console.error("[boards] signing a new deliverable's preview", signError.message);
    previewUrl = signed?.signedUrl ?? null;
  }
  return { ok: true, item: shapeDeliverable(saved as unknown as DeliverableRow, previewUrl) };
}

/** Cancel: an upload in flight is stopped by the browser; this clears what it left. */
export async function cancelCardUpload(taskId: string, deliverableId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await boardMutation({ table: "tasks", id: taskId, label: "card" });
  if (!gate.ok) return gate;
  const { data: row, error } = await companyOs
    .from("task_attachments")
    .select("storage_path")
    .eq("id", deliverableId)
    .eq("task_id", taskId)
    .is("confirmed_at", null)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (row?.storage_path) await discard(deliverableId, row.storage_path);
  return { ok: true };
}

/** A download link for a file on the card, signed now and saved, never rendered. */
export async function signCardDownload(taskId: string, deliverableId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const gate = await boardMutation({ table: "tasks", id: taskId, label: "card" });
  if (!gate.ok) return gate;
  const { data: row, error } = await companyOs
    .from("task_attachments")
    .select("storage_path, filename")
    .eq("id", deliverableId)
    .eq("task_id", taskId)
    .eq("kind", "file")
    .is("archived_at", null)
    .not("confirmed_at", "is", null)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row?.storage_path) return { ok: false, error: "That file is no longer on the card." };
  const { data, error: signError } = await supabase.storage
    .from(DELIVERABLES_BUCKET)
    .createSignedUrl(row.storage_path, DOWNLOAD_SECONDS, { download: row.filename ?? true });
  if (signError || !data) return { ok: false, error: "Could not open the file. Try again." };
  return { ok: true, url: data.signedUrl };
}
