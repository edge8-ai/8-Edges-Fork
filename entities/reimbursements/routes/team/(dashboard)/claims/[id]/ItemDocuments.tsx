"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { resumableUploadToSignedPath } from "@/kernel/ui/upload";
import { formatBytes } from "@/kernel/ui/format";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import type { MyItem } from "@/entities/reimbursements/lib/my-claims";
import type { OwnerRemoval } from "@/entities/reimbursements/lib/retention-rules";
import { DOCUMENT_KIND_LABEL, type DocumentKind } from "@/entities/reimbursements/lib/claim-labels";
import { documentOptional } from "@/entities/reimbursements/lib/categories";
import { ReplacedBadge } from "@/entities/reimbursements/ui/ItemTags";
import { cancelOwnUpload, confirmOwnUpload, markOwnFileReplaced, openOwnFile, removeOwnFile, startOwnUpload } from "../actions";

// A receipt's documents: the photo or PDF of the receipt and, for something
// bought in Vietnam, the red invoice PDF. The file goes straight from the
// browser to the private bucket with a resumable upload (kernel/ui/upload.ts)
// and is confirmed only after the server has looked at what arrived. A phone
// opens its camera through the second picker.
//
// A document comes off the way `removal` says (ownerCan(claim).remove): from
// a draft never submitted it is deleted; from a claim that was, it is marked
// replaced and stays here, satisfying nothing (plan §10, 20261008090000), and
// the owner adds the new one. Null while the claim, or this receipt, is not
// theirs to change.

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";
type Kind = DocumentKind;

export function ItemDocuments({ claimId, item, removal }: { claimId: string; item: MyItem; removal: OwnerRemoval }) {
  const router = useRouter();
  const editable = removal !== null;
  const current = item.documents.filter((d) => !d.replacedAt);
  // An item bought in Vietnam cannot be submitted without its red invoice
  // (RB.2), so that is the document its uploader starts on. A ride needs none
  // (RB.15): what it has is the app's receipt.
  const [kind, setKind] = useState<Kind>(item.boughtInVietnam && !documentOptional(item.category) ? "red_invoice" : "receipt");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const files = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError(null);
    const started = await startOwnUpload(item.id, kind, { name: file.name, size: file.size, type: file.type });
    if (!started.ok) return setError(started.error);
    setProgress(0);
    resumableUploadToSignedPath({
      file,
      bucket: started.bucket,
      path: started.path,
      token: started.token,
      onProgress: (sent) => setProgress(file.size > 0 ? sent / file.size : 1),
      onError: (why) => {
        setProgress(null);
        setError(why === "refused" ? "The storage refused the file. Check its type and size." : "The upload stopped. Try again.");
        void cancelOwnUpload(started.fileId);
      },
      onSuccess: async () => {
        const confirmed = await confirmOwnUpload(claimId, started.fileId);
        setProgress(null);
        if (!confirmed.ok) return setError(confirmed.error);
        router.refresh();
      },
    });
  }

  const picked = (input: HTMLInputElement | null) => {
    const file = input?.files?.[0];
    if (input) input.value = "";
    if (file) void upload(file);
  };

  const open = (fileId: string) =>
    start(async () => {
      const res = await openOwnFile(fileId);
      if (!res.ok) return setError(res.error);
      window.open(res.url, "_blank", "noopener");
    });

  const remove = (fileId: string) =>
    start(async () => {
      const res = await removeOwnFile(claimId, fileId);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });

  return (
    <div className="u-stack u-gap-1">
      {current.length === 0 && <span className="admin-hint">No document yet.</span>}
      {item.documents.map((doc) => (
        <div key={doc.id} className="u-row u-between u-items-center u-gap-1 u-wrap">
          <span className="u-min-0 u-truncate">
            <span className="u-strong">{DOCUMENT_KIND_LABEL[doc.kind]}</span> · {doc.filename}
            {doc.sizeBytes !== null && <span className="admin-cell-muted"> · {formatBytes(doc.sizeBytes)}</span>} {doc.replacedAt && <ReplacedBadge />}
          </span>
          <span className="u-row u-gap-1">
            <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => open(doc.id)}>
              Open
            </button>
            {removal === "delete" && (
              <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost" disabled={pending} onClick={() => remove(doc.id)}>
                Remove
              </button>
            )}
            {removal === "mark" && !doc.replacedAt && (
              <ConfirmButton
                className="admin-btn admin-btn--sm admin-btn--ghost"
                label="Replace"
                title={`Replace ${doc.filename}?`}
                body="This claim was submitted before, so the document stays on it, marked replaced, and no longer counts. Add the new one after."
                confirmLabel="Mark replaced"
                onConfirm={() => markOwnFileReplaced(claimId, doc.id)}
                onDone={() => router.refresh()}
              />
            )}
          </span>
        </div>
      ))}
      {editable && progress === null && (
        <div className="u-row u-gap-1 u-wrap u-items-center u-mt-1">
          <select className="admin-select u-w-auto" aria-label="Document kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="receipt">Receipt (photo or PDF)</option>
            <option value="red_invoice">Red invoice (PDF)</option>
          </select>
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => files.current?.click()}>
            Add file
          </button>
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => camera.current?.click()} disabled={kind === "red_invoice"}>
            Take photo
          </button>
          <input ref={files} type="file" className="u-hidden-input" accept={kind === "red_invoice" ? "application/pdf" : ACCEPT} onChange={(e) => picked(e.currentTarget)} />
          <input ref={camera} type="file" className="u-hidden-input" accept="image/*" capture="environment" onChange={(e) => picked(e.currentTarget)} />
        </div>
      )}
      {progress !== null && (
        <div className="admin-progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="admin-progress-fill" data-p={String(Math.min(100, Math.round(progress * 10) * 10))} />
        </div>
      )}
      {error && (
        <div className="admin-alert admin-alert--err" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
