// The page's file uploads to card deliverables (W.128), kept OUTSIDE the
// drawer on purpose: the canvas promises "Keeps going if the connection drops.
// You can close the card." A drawer's state dies with the drawer, so an upload
// started there would stop when the card closed; held here, it carries on for
// as long as the page is open, and the drawer only shows what it finds.
//
// Each file goes straight to the private bucket through the kernel's resumable
// upload (kernel/ui/upload), carrying the signed token the start action
// returned. When the bytes are in, the confirm action looks at what arrived.

import { useSyncExternalStore } from "react";
import type { Result } from "@/kernel/data/result";
import { resumableUploadToSignedPath, type ResumableHandle } from "@/kernel/ui/upload";
import { refuseFile, withNormalisedType, type FileRefusal } from "@/entities/boards/lib/deliverable-rules";
import { cancelCardUpload, confirmCardUpload, startCardUpload } from "@/entities/boards/lib/deliverable-files";
import { linkLabel, type Deliverable } from "@/entities/boards/lib/deliverable-types";

export type UploadSource = "pasted" | "dropped" | "chosen";

/** Where a started upload writes, as the start action signed it. */
type Started = { deliverableId: string; bucket: string; path: string; token: string };

/**
 * An upload that stopped part way, with its row and its partial bytes kept so
 * Try again carries on from the stored offset (bug hunt F0) instead of
 * starting again from byte 0 under a new row.
 */
type Resume = Started & { uploadUrl: string | null; sent: number };

export type CardUpload =
  | { key: string; kind: "uploading"; name: string; size: number; sent: number; source: UploadSource; phase: "sending" | "checking" }
  | {
      key: string;
      kind: "failed";
      name: string;
      message: string;
      file: File;
      source: UploadSource;
      /** Set when the bytes are stored and only the confirm failed: Try again re-checks them instead of re-sending. */
      storedAs?: string;
      /** Set when the upload stopped part way: Try again resumes it. */
      resume?: Resume;
    }
  | { key: string; kind: "refused"; name: string; refusal: FileRefusal };

type TaskUploads = { entries: CardUpload[] };

const EMPTY: TaskUploads = { entries: [] };
// An open drawer listens for deliverables arriving on its card: a file that
// finished, or one that Undo put back. A card that is closed has no listener
// and needs none: the row is on the server, and the list the drawer reads when
// it next opens includes it.
const arrivedListeners = new Map<string, Set<(item: Deliverable) => void>>();
const byTask = new Map<string, TaskUploads>();
const live = new Map<string, { upload: ResumableHandle | null; deliverableId: string | null; taskId: string; cancelled: boolean }>();
const listeners = new Set<() => void>();
let counter = 0;

function read(taskId: string): TaskUploads {
  return byTask.get(taskId) ?? EMPTY;
}
function write(taskId: string, next: TaskUploads) {
  byTask.set(taskId, next);
  for (const l of listeners) l();
}
function patch(taskId: string, key: string, change: (u: CardUpload) => CardUpload | null) {
  const cur = read(taskId);
  const entries = cur.entries.flatMap((u) => (u.key === key ? (change(u) ?? []) : [u]));
  write(taskId, { ...cur, entries });
}

/** A pasted screenshot arrives as "image.png"; the row should say what it is. */
function named(file: File, source: UploadSource): File {
  if (source !== "pasted" || !/^image\.(png|jpe?g|gif|webp)$/i.test(file.name)) return file;
  const day = new Date().toISOString().slice(0, 10);
  return new File([file], `screenshot ${day}.${file.name.split(".").pop()}`, { type: file.type });
}

async function send(taskId: string, key: string, file: File, source: UploadSource) {
  const begun = await startCardUpload(taskId, { name: file.name, size: file.size, type: file.type }).catch(() => null);
  const handle = live.get(key);
  if (!begun || !begun.ok) {
    live.delete(key);
    if (begun && !begun.ok && begun.refusal) patch(taskId, key, () => ({ key, kind: "refused", name: file.name, refusal: begun.refusal! }));
    else patch(taskId, key, () => ({ key, kind: "failed", name: file.name, message: begun?.error ?? "The server did not answer.", file, source }));
    return;
  }
  if (!handle || handle.cancelled) {
    void cancelCardUpload(taskId, begun.deliverableId);
    return;
  }
  handle.deliverableId = begun.deliverableId;
  transfer(taskId, key, file, source, { deliverableId: begun.deliverableId, bucket: begun.bucket, path: begun.path, token: begun.token }, null, 0);
}

/** Sends the bytes, or the rest of them when `resumeUrl` names an earlier try. */
function transfer(taskId: string, key: string, file: File, source: UploadSource, started: Started, resumeUrl: string | null, from: number) {
  const handle = live.get(key);
  if (!handle) return;
  let sent = from;
  handle.upload = resumableUploadToSignedPath({
    file,
    bucket: started.bucket,
    path: started.path,
    token: started.token,
    resumeUrl,
    onProgress: (n) => {
      sent = n;
      patch(taskId, key, (u) => (u.kind === "uploading" ? { ...u, sent: n } : u));
    },
    onError: (why) => {
      live.delete(key);
      if (why === "refused") {
        // The storage said no; sending the same bytes under the same token
        // would be refused again, so the row goes and Try again starts afresh.
        patch(taskId, key, () => ({ key, kind: "failed", name: file.name, message: "The storage refused the upload. Try again to send it afresh.", file, source }));
        void cancelCardUpload(taskId, started.deliverableId);
        return;
      }
      // A connection that dropped is not a refusal: the row and the partial
      // bytes stay, so Try again picks up from the stored offset. If nobody
      // tries again, dismissing the row or the daily sweep clears them.
      const uploadUrl = handle.upload?.uploadUrl() ?? resumeUrl;
      patch(taskId, key, () => ({
        key,
        kind: "failed",
        name: file.name,
        message: "The upload stopped. Try again to pick up where it left off.",
        file,
        source,
        resume: { ...started, uploadUrl, sent },
      }));
    },
    onSuccess: () => void confirm(taskId, key, file, source, started.deliverableId),
  });
}

async function confirm(taskId: string, key: string, file: File, source: UploadSource, deliverableId: string) {
  const name = file.name;
  patch(taskId, key, (u) => (u.kind === "uploading" ? { ...u, sent: u.size, phase: "checking" } : u));
  const confirmed = await confirmCardUpload(taskId, deliverableId).catch(() => null);
  live.delete(key);
  if (confirmed?.ok) {
    patch(taskId, key, () => null);
    announce(taskId, confirmed.item);
  } else if (confirmed && !confirmed.ok && confirmed.refusal) {
    patch(taskId, key, () => ({ key, kind: "refused", name, refusal: confirmed.refusal! }));
  } else {
    // The bytes are stored; only the check failed. Try again re-runs confirm on
    // them (bug hunt B2/F3) rather than sending the whole file again under a
    // new row, which left the first copy for the sweep, or duplicated it.
    patch(taskId, key, () => ({ key, kind: "failed", name, message: confirmed?.error ?? "The file arrived but could not be saved.", file, source, storedAs: deliverableId }));
  }
}

/** Starts uploading files to a card; anything the rules refuse is refused at once. */
export function uploadToCard(taskId: string, files: File[], source: UploadSource) {
  const cur = read(taskId);
  const added: CardUpload[] = [];
  for (const raw of files) {
    const file = withNormalisedType(named(raw, source));
    const key = `u${(counter += 1)}`;
    const refusal = refuseFile({ name: file.name, size: file.size, type: file.type });
    if (refusal) {
      added.push({ key, kind: "refused", name: file.name, refusal });
      continue;
    }
    added.push({ key, kind: "uploading", name: file.name, size: file.size, sent: 0, source, phase: "sending" });
    live.set(key, { upload: null, deliverableId: null, taskId, cancelled: false });
    void send(taskId, key, file, source);
  }
  write(taskId, { ...cur, entries: [...cur.entries, ...added] });
}

/** Stops an upload and clears what it left; or dismisses a refusal or a failure. */
export function dropUpload(taskId: string, key: string) {
  const handle = live.get(key);
  if (handle) {
    handle.cancelled = true;
    handle.upload?.abort();
    if (handle.deliverableId) void cancelCardUpload(taskId, handle.deliverableId);
    live.delete(key);
  } else {
    // A dismissed failure may still have a row and stored or partial bytes;
    // clear them now rather than leave them for the nightly sweep.
    const entry = read(taskId).entries.find((u) => u.key === key);
    const kept = entry?.kind === "failed" ? (entry.storedAs ?? entry.resume?.deliverableId) : undefined;
    if (kept) void cancelCardUpload(taskId, kept);
  }
  patch(taskId, key, () => null);
}

/**
 * Tries a failed upload again: re-checks bytes already stored, resumes an
 * upload that stopped part way, or else sends the file again from the start.
 */
export function retryUpload(taskId: string, key: string) {
  const failed = read(taskId).entries.find((u) => u.key === key);
  if (failed?.kind !== "failed") return;
  if (failed.storedAs) {
    const deliverableId = failed.storedAs;
    live.set(key, { upload: null, deliverableId, taskId, cancelled: false });
    patch(taskId, key, () => ({ key, kind: "uploading", name: failed.name, size: failed.file.size, sent: failed.file.size, source: failed.source, phase: "checking" }));
    void confirm(taskId, key, failed.file, failed.source, deliverableId);
    return;
  }
  if (failed.resume) {
    const { uploadUrl, sent, ...started } = failed.resume;
    live.set(key, { upload: null, deliverableId: started.deliverableId, taskId, cancelled: false });
    patch(taskId, key, () => ({ key, kind: "uploading", name: failed.name, size: failed.file.size, sent, source: failed.source, phase: "sending" }));
    transfer(taskId, key, failed.file, failed.source, started, uploadUrl, sent);
    return;
  }
  patch(taskId, key, () => null);
  uploadToCard(taskId, [failed.file], failed.source);
}

function announce(taskId: string, item: Deliverable) {
  for (const l of arrivedListeners.get(taskId) ?? []) l(item);
}

/** Tells an open drawer when a deliverable arrives on its card: a file confirmed, or one Undo put back. */
export function onDeliverableArrived(taskId: string, listener: (item: Deliverable) => void): () => void {
  const set = arrivedListeners.get(taskId) ?? new Set();
  set.add(listener);
  arrivedListeners.set(taskId, set);
  return () => set.delete(listener);
}

/** Whether anything is still sending, so the page can warn before it closes. */
export function anyUploading(): boolean {
  return live.size > 0;
}

/** A card's uploads as they stand, for readers outside React (and tests). */
export function peekEntries(taskId: string): CardUpload[] {
  return read(taskId).entries;
}

export function useCardUploads(taskId: string): TaskUploads {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => read(taskId),
    () => EMPTY,
  );
}

// ─── The card's list, removals and Undo (bug hunt F2, F18 to F21, F23) ───────
// Held here rather than in the drawer for the same reason the uploads are: the
// toast that offers Undo outlives the drawer, so what it restores has to reach
// whichever drawer is open for that card when it is pressed, not the one that
// was open when the row was removed.

export type ListApi = {
  list: (taskId: string) => Promise<{ ok: true; items: Deliverable[] } | { ok: false; error: string }>;
  restore: (taskId: string, deliverableId: string) => Promise<Result>;
};

export const byAdded = (a: Deliverable, b: Deliverable) => a.createdAt.localeCompare(b.createdAt);

/** The list with one deliverable put in, or put in again with its fresher copy. */
export function withDeliverable(list: Deliverable[] | null, item: Deliverable): Deliverable[] {
  return [...(list ?? []).filter((d) => d.id !== item.id), item].sort(byAdded);
}

/** What changed on the card here while a list read was in flight. */
export type ListJournal = { added: Map<string, Deliverable>; removed: Set<string> };

/**
 * A list read's answer, merged with what changed while it was in flight. The
 * server's rows win where both have one (they carry fresh signed previews), a
 * row removed here meanwhile stays removed, and a row added here meanwhile, by
 * a link, a finished upload or an Undo, stays even though the read missed it.
 */
export function mergeListed(server: Deliverable[], journal: ListJournal): Deliverable[] {
  const rows = server.filter((d) => !journal.removed.has(d.id));
  const ids = new Set(rows.map((d) => d.id));
  return [...rows, ...[...journal.added.values()].filter((d) => !ids.has(d.id))].sort(byAdded);
}

const removing = new Set<string>();

/**
 * Runs a remove unless one for the same deliverable is already in flight, so a
 * double click sends one archive and not a second that reports a false error
 * (bug hunt F20). Returns null for the click it ignored.
 */
export async function removeOnce<T>(deliverableId: string, run: () => Promise<T>): Promise<T | null> {
  if (removing.has(deliverableId)) return null;
  removing.add(deliverableId);
  try {
    return await run();
  } finally {
    removing.delete(deliverableId);
  }
}

/** How long the Undo toast stays: the kernel toast's own ten seconds, passed to it explicitly. */
export const UNDO_MS = 10_000;

export type Removal = { taskId: string; item: Deliverable };
let batch: { removals: Removal[]; until: number } | null = null;

/**
 * Records a removal for Undo and returns everything removed while the toast
 * has been on screen. A second remove replaces the toast, so the new toast's
 * Undo has to cover the first one too (bug hunt F18).
 */
export function noteRemoval(taskId: string, item: Deliverable, now: number = Date.now()): Removal[] {
  const open = batch && now < batch.until ? batch.removals.filter((r) => r.item.id !== item.id) : [];
  batch = { removals: [...open, { taskId, item }], until: now + UNDO_MS };
  return batch.removals;
}

/** "Removed brief.pdf", or "Removed 2 deliverables" when the toast covers more than one. */
export function removalMessage(removals: Removal[]): string {
  if (removals.length !== 1) return `Removed ${removals.length} deliverables`;
  const d = removals[0].item;
  return `Removed ${d.kind === "link" ? linkLabel(d) : (d.filename ?? "the file")}`;
}

/**
 * Undo: puts every removal back, then reads each card's list once for the
 * fresh rows, because the removed copies carry signed previews that may have
 * expired (bug hunt F21), and announces them so an open drawer for that card
 * shows them, even one opened after the remove (bug hunt F19).
 */
export async function undoRemovals(removals: Removal[], api: ListApi): Promise<Result> {
  if (batch?.removals === removals) batch = null;
  const results = await Promise.all(
    removals.map((r) => api.restore(r.taskId, r.item.id).catch((): Result => ({ ok: false, error: "The server did not answer. Try again." }))),
  );
  const back = removals.filter((_, i) => results[i].ok);
  for (const taskId of new Set(back.map((r) => r.taskId))) {
    const listed = await api.list(taskId).catch(() => null);
    const fresh = new Map(listed?.ok ? listed.items.map((d) => [d.id, d] as const) : []);
    for (const r of back) if (r.taskId === taskId) announce(taskId, fresh.get(r.item.id) ?? r.item);
  }
  const refused = results.find((r): r is { ok: false; error: string } => !r.ok);
  if (!refused) return { ok: true };
  return removals.length === 1 ? refused : { ok: false, error: `Put back ${back.length} of ${removals.length}. ${refused.error}` };
}
