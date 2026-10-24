// What a NEW card is given before it exists (W.163 U7): files and links held
// on the page as pending rows, because there is no card id to upload to or
// hang a link on until Create. On Create, once createCard has returned the id,
// the form hands them to the card: files to the page's upload store, which
// carries on after the drawer closes, and links to addCardLink.
//
// Held outside the drawer, like the upload store, so that the save (in
// useCardForm) and the section (NewCardDeliverables) read the same list. Only
// one new card is open on a page at a time, so the list is not keyed.

import { useSyncExternalStore } from "react";
import { externalHref } from "@/kernel/ui/url";
import { refuseFile, withNormalisedType, type FileRefusal } from "@/entities/boards/lib/deliverable-rules";
import { prKey } from "@/entities/boards/lib/types";
import { addCardLink } from "@/entities/boards/lib/deliverables";
import { uploadToCard, type UploadSource } from "./card-uploads";

export type PendingDeliverable =
  | { key: string; kind: "file"; file: File; source: UploadSource }
  | { key: string; kind: "link"; url: string }
  | { key: string; kind: "refused"; name: string; refusal: FileRefusal };

const NONE: readonly PendingDeliverable[] = [];
let pending: readonly PendingDeliverable[] = NONE;
const listeners = new Set<() => void>();
let counter = 0;

function set(next: readonly PendingDeliverable[]) {
  pending = next;
  for (const l of listeners) l();
}

/** Holds files for the new card; anything the rules refuse is refused at once, as on a saved card. */
export function holdFiles(files: File[], source: UploadSource) {
  const added = files.map((raw): PendingDeliverable => {
    const file = withNormalisedType(raw);
    const key = `p${(counter += 1)}`;
    const refusal = refuseFile({ name: file.name, size: file.size, type: file.type });
    return refusal ? { key, kind: "refused", name: file.name, refusal } : { key, kind: "file", file, source };
  });
  set([...pending, ...added]);
}

/**
 * Holds a link for the new card, or says why not, in the words addCardLink
 * would use, so the person hears it now rather than after Create.
 */
export function holdLink(raw: string): { ok: true } | { ok: false; error: string } {
  const url = externalHref(raw);
  if (!url) return { ok: false, error: "That isn't a web address. Paste a link that starts with https://." };
  if (prKey(url)) return { ok: false, error: "That's a pull request. It goes in the PR field, where it shows its merge state." };
  if (pending.some((p) => p.kind === "link" && p.url === url)) return { ok: false, error: "That link is already on the card." };
  set([...pending, { key: `p${(counter += 1)}`, kind: "link", url }]);
  return { ok: true };
}

/** Takes one pending row off before Create. */
export function dropPending(key: string) {
  set(pending.filter((p) => p.key !== key));
}

/** Forgets every pending row: the new card was closed without being created. */
export function clearPending() {
  if (pending.length > 0) set(NONE);
}

/** The pending rows, emptied: each is handed over exactly once. */
export function takePending(): readonly PendingDeliverable[] {
  const taken = pending;
  set(NONE);
  return taken;
}

export function peekPending(): readonly PendingDeliverable[] {
  return pending;
}

export function usePendingDeliverables(): readonly PendingDeliverable[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pending,
    () => NONE,
  );
}

type Handover = {
  upload: (taskId: string, files: File[], source: UploadSource) => void;
  addLink: (taskId: string, url: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

/**
 * Hands the pending rows to the card Create just made. Files start uploading
 * at once, through the same store a saved card uses, so they carry on after
 * the drawer closes and show on the card when it is opened. Links are added in
 * the order they were held. Returns what could not be added, in a sentence,
 * or null when everything went; a refused file was already shown as refused
 * and is not sent.
 */
export async function handPendingToCard(taskId: string, items: readonly PendingDeliverable[], to: Handover): Promise<string | null> {
  const files = items.filter((p): p is Extract<PendingDeliverable, { kind: "file" }> => p.kind === "file");
  for (const source of ["chosen", "dropped", "pasted"] as const) {
    const batch = files.filter((f) => f.source === source).map((f) => f.file);
    if (batch.length > 0) to.upload(taskId, batch, source);
  }
  const failed: string[] = [];
  for (const p of items) {
    if (p.kind !== "link") continue;
    const res = await to.addLink(taskId, p.url).catch(() => ({ ok: false as const, error: "The server did not answer." }));
    if (!res.ok) failed.push(p.url);
  }
  if (failed.length === 0) return null;
  return failed.length === 1
    ? `The card was created, but the link ${failed[0]} could not be added. Open the card to add it again.`
    : `The card was created, but ${failed.length} links could not be added. Open the card to add them again.`;
}

/**
 * Takes the pending rows (at once, before anything awaits, so the section that
 * holds them can go) and hands them to the card Create just made.
 */
export function handPendingToNewCard(taskId: string): Promise<string | null> {
  return handPendingToCard(taskId, takePending(), { upload: uploadToCard, addLink: addCardLink });
}
