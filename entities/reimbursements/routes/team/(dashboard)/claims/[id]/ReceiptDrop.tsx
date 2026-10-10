"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { resumableUploadToSignedPath } from "@/kernel/ui/upload";
import { cancelOwnUpload, confirmOwnUpload, removeOwnItem, startOwnDrop } from "../actions";

// Many receipts at once (RB.9): drop a pile of files, pick several, or take a
// photo with the phone's camera, and each file becomes its own receipt on the
// claim. A PDF is filed as the red invoice a Vietnamese purchase needs, a photo
// as its receipt. Each upload is started on the server one after another (so
// the receipts keep the order they were dropped in), then all of them go
// straight to the private bucket side by side, resumably, and each is
// confirmed as it lands. Confirming has the AI read the file and fill in what
// it can; the person checks every receipt before submitting.

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";

type Row = { key: string; name: string; state: "starting" | "uploading" | "reading" | "done" | "failed"; progress: number; error?: string };

const STATE_LABEL: Record<Row["state"], string> = {
  starting: "Starting…",
  uploading: "Uploading",
  reading: "Reading the receipt…",
  done: "Added",
  failed: "Not added",
};

export function ReceiptDrop({ claimId }: { claimId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [drag, setDrag] = useState(false);
  const files = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const busy = rows.some((r) => r.state !== "done" && r.state !== "failed");

  const patch = (key: string, next: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...next } : r)));

  /** Uploads one started file and confirms it; resolves when it is added or has failed. */
  const send = (key: string, file: File, started: { itemId: string; fileId: string; bucket: string; path: string; token: string }) =>
    new Promise<void>((resolve) => {
      patch(key, { state: "uploading" });
      const fail = async (error: string, cancel: boolean) => {
        if (cancel) await cancelOwnUpload(started.fileId);
        // The receipt was made for this file alone; without it, it is an empty line.
        await removeOwnItem(claimId, started.itemId);
        patch(key, { state: "failed", error });
        resolve();
      };
      resumableUploadToSignedPath({
        file,
        bucket: started.bucket,
        path: started.path,
        token: started.token,
        onProgress: (sent) => patch(key, { progress: file.size > 0 ? sent / file.size : 1 }),
        onError: (why) => void fail(why === "refused" ? "The storage refused the file. Check its type and size." : "The upload stopped. Try again.", true),
        onSuccess: async () => {
          patch(key, { state: "reading", progress: 1 });
          const confirmed = await confirmOwnUpload(claimId, started.fileId);
          if (!confirmed.ok) return void fail(confirmed.error, false);
          patch(key, { state: "done" });
          resolve();
        },
      });
    });

  async function add(list: File[]) {
    if (list.length === 0) return;
    const batch = list.map((file, i) => ({ key: `${Date.now()}-${i}-${file.name}`, file }));
    setRows((prev) => [...prev.filter((r) => r.state !== "done"), ...batch.map(({ key, file }) => ({ key, name: file.name, state: "starting" as const, progress: 0 }))]);
    const uploads: Promise<void>[] = [];
    for (const { key, file } of batch) {
      const started = await startOwnDrop(claimId, { name: file.name, size: file.size, type: file.type });
      if (!started.ok) {
        patch(key, { state: "failed", error: started.error });
        continue;
      }
      uploads.push(send(key, file, started));
    }
    await Promise.all(uploads);
    router.refresh();
  }

  const picked = (input: HTMLInputElement | null) => {
    const list = input?.files ? Array.from(input.files) : [];
    if (input) input.value = "";
    void add(list);
  };

  return (
    <div className="u-stack u-gap-2">
      <div
        className={`admin-gallery-drop${drag ? " is-drag" : ""}`}
        role="button"
        tabIndex={0}
        aria-label="Add receipts: drop files here or choose them"
        onClick={() => files.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            files.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void add(Array.from(e.dataTransfer.files));
        }}
      >
        <span className="admin-gallery-drop-ico" aria-hidden>
          ⬆
        </span>
        <span className="admin-gallery-drop-title">Drop receipts here, or click to choose several</span>
        <span className="admin-gallery-drop-sub">One receipt per file. PDFs are filed as red invoices, photos as receipts. The details are read for you; check each one.</span>
      </div>
      <div className="u-row u-gap-1 u-wrap">
        <button type="button" className="admin-btn admin-btn--sm" onClick={() => camera.current?.click()}>
          Take a photo
        </button>
        {busy && <span className="admin-hint">Keep this page open until every receipt is added.</span>}
      </div>
      <input ref={files} type="file" multiple className="u-hidden-input" accept={ACCEPT} onChange={(e) => picked(e.currentTarget)} />
      <input ref={camera} type="file" className="u-hidden-input" accept="image/*" capture="environment" onChange={(e) => picked(e.currentTarget)} />
      {rows.length > 0 && (
        <div className="admin-list">
          {rows.map((r) => (
            <div key={r.key} className="admin-list-row">
              <div className="admin-list-main u-stack u-gap-1">
                <div className="admin-list-title u-truncate">{r.name}</div>
                <div className="admin-list-sub">{r.error ? <span className="u-err">{r.error}</span> : STATE_LABEL[r.state]}</div>
                {r.state === "uploading" && (
                  <div className="admin-progress" role="progressbar" aria-valuenow={Math.round(r.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <div className="admin-progress-fill" data-p={String(Math.min(100, Math.round(r.progress * 10) * 10))} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
