"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { showToast } from "@/kernel/ui/Toast";
import { addCardLink, listCardDeliverables, removeCardDeliverable, restoreCardDeliverable } from "@/entities/boards/lib/deliverables";
import { signCardDownload } from "@/entities/boards/lib/deliverable-files";
import { FILE_ACCEPT, isVideoType } from "@/entities/boards/lib/deliverable-rules";
import type { Deliverable } from "@/entities/boards/lib/deliverable-types";
import { DeliverableAdds } from "./DeliverableAdds";
import { DeliverableLinkBox } from "./DeliverableLinkBox";
import { FileRow, LinkRow, RefusedRow, UploadRow } from "./DeliverableRows";
import { VideoRow } from "./DeliverableVideoRow";
import {
  anyUploading,
  dropUpload,
  noteRemoval,
  removalMessage,
  removeOnce,
  retryUpload,
  undoRemovals,
  uploadToCard,
  useCardUploads,
  UNDO_MS,
  type UploadSource,
} from "./card-uploads";
import { useCardFileIntake } from "./useCardFileIntake";
import { useDeliverableList } from "./useDeliverableList";

/**
 * A card's Deliverables (W.155, W.128): what the work produced, other than its
 * PR, as the approved canvas draws the section — "Deliverables · 3" with File
 * and Link, one row per deliverable, the uploads in flight, and the line that
 * says a file can be dropped anywhere on the card or pasted.
 *
 * Team only. The drawer draws this on team surfaces and never on the portal,
 * and every action refuses anyone who is not on the board.
 *
 * The list is the server's (useDeliverableList): read when the card opens,
 * added to with the rows the server returns, and taken from only once the
 * server has archived a row. Remove offers Undo in the board's toast, and the
 * Undo lives in card-uploads so it still reaches the card after the drawer
 * closes. Uploads live there too, so closing the card does not stop one; a
 * file that finishes while the card is closed is in the list when it reopens.
 */
const SERVER = { list: listCardDeliverables, add: addCardLink, remove: removeCardDeliverable, restore: restoreCardDeliverable };
export type DeliverablesApi = typeof SERVER;

export function CardDeliverables({
  taskId,
  currentPrUrl,
  onUseAsPr,
  api = SERVER,
}: {
  taskId: string;
  currentPrUrl: string;
  onUseAsPr: (url: string) => void;
  /** The server actions. The drawer passes nothing; a check with no database passes a fake. */
  api?: DeliverablesApi;
}) {
  const { items, error, setError, arrive, depart, refresh } = useDeliverableList(taskId, api);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const section = useRef<HTMLElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const uploads = useCardUploads(taskId);

  // Closing the page, unlike closing the card, would stop an upload.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (anyUploading()) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const intake = useCallback((files: File[], source: UploadSource) => uploadToCard(taskId, files, source), [taskId]);
  useCardFileIntake(section, intake);

  async function add(url: string): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const res = await api.add(taskId, url);
      if (!res.ok) {
        setError(res.error);
        return false;
      }
      arrive(res.item);
      setAdding(false);
      return true;
    } catch {
      setError("The server did not answer. Try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function remove(d: Deliverable) {
    const res = await removeOnce(d.id, () => {
      setError(null);
      return api.remove(taskId, d.id).catch(() => ({ ok: false as const, error: "The server did not answer. Try again." }));
    });
    // Null is the second click of a double click, while the first is in flight.
    if (!res) return;
    if (!res.ok) {
      setError(res.error);
      return;
    }
    depart(d.id);
    // One toast covers every row removed while it is up, so a second remove
    // does not take away the first one's Undo.
    const removals = noteRemoval(taskId, d);
    showToast({ message: removalMessage(removals), ms: UNDO_MS, action: { label: "Undo", run: () => undoRemovals(removals, api) } });
  }

  /** A video's fresh signed address after its old one failed, or null. */
  async function freshPreview(id: string): Promise<string | null> {
    const list = await refresh();
    return list?.find((x) => x.id === id)?.previewUrl ?? null;
  }

  // Signed at the moment it is asked for and saved, never drawn by the app.
  async function open(d: Deliverable) {
    const res = await signCardDownload(taskId, d.id).catch(() => null);
    if (res?.ok) window.location.assign(res.url);
    else setError(res && !res.ok ? res.error : "The server did not answer. Try again.");
  }

  const count = items?.length ?? 0;
  return (
    <section ref={section} className="wb-drawer-block wb-deliv" aria-label="Deliverables">
      <div className="wb-deliv-head">
        <h3 className="wb-drawer-heading">Deliverables{count > 0 ? ` · ${count}` : ""}</h3>
        <div className="wb-deliv-adds">
          <DeliverableAdds onChooseFile={() => picker.current?.click()} onToggleLink={() => setAdding((a) => !a)} linkOpen={adding} />
          <input
            ref={picker}
            type="file"
            multiple
            accept={FILE_ACCEPT}
            className="u-sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length > 0) intake(files, "chosen");
            }}
          />
        </div>
      </div>

      {error && (
        <p className="wb-deliv-error" role="alert">
          {error}
        </p>
      )}
      {items === null && !error && <p className="wb-deliv-hint">Loading…</p>}

      {(count > 0 || uploads.entries.length > 0) && (
        <ul className="wb-deliv-list">
          {(items ?? []).map((d) =>
            d.kind === "link" ? (
              <LinkRow key={d.id} d={d} onRemove={() => void remove(d)} />
            ) : (
              isVideoType(d.mimeType) ? (
                <VideoRow key={d.id} d={d} onOpen={() => void open(d)} onRemove={() => void remove(d)} onRefresh={() => freshPreview(d.id)} />
              ) : (
                <FileRow key={d.id} d={d} onOpen={() => void open(d)} onRemove={() => void remove(d)} />
              )
            ),
          )}
          {uploads.entries.map((u) =>
            u.kind === "uploading" ? (
              <UploadRow key={u.key} u={u} onCancel={() => dropUpload(taskId, u.key)} />
            ) : (
              <RefusedRow
                key={u.key}
                u={u}
                onDismiss={() => dropUpload(taskId, u.key)}
                onAddLink={() => setAdding(true)}
                onRetry={() => retryUpload(taskId, u.key)}
              />
            ),
          )}
        </ul>
      )}

      {adding && <DeliverableLinkBox saving={saving} currentPrUrl={currentPrUrl} onAdd={add} onUseAsPr={onUseAsPr} onClose={() => setAdding(false)} />}
      {items !== null && !adding && <p className="wb-deliv-hint">Drop a file anywhere on the card, or paste a screenshot.</p>}
    </section>
  );
}
