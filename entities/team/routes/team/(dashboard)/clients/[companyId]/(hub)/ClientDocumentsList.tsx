"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientDocument } from "@/entities/portal/client";
import {
  teamDownloadClientDocument,
  teamSignedClientDocumentUpload,
  teamRecordClientDocument,
  teamAddClientLink,
  teamDeleteOwnClientDocument,
} from "./documents-actions";
import { formatBytes } from "@/kernel/ui/format";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { putToSignedUrl } from "@/kernel/ui/upload";
import { ExternalLink } from "@/kernel/ui/ExternalLink";
import { externalHref } from "@/kernel/ui/url";

// Client document vault on /team: list + direct-to-storage upload + delete-own.
// Mirrors the portal DocumentsView: files PUT straight to Supabase Storage via
// a one-shot signed URL, so bytes never pass through the serverless function.
// Delete is uploader-only; the server re-checks, the UI just hides the button.

type QueueItem = {
  id: number;
  file: File;
  progress: number; // 0..1
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// The host of a stored link, or the stored text itself when it is not one
// (new URL("javascript:…").hostname is "", which left a bare " · ").
function linkHost(url: string): string {
  const href = externalHref(url);
  return href ? new URL(href).hostname : url;
}

// programId (optional) tags every upload to that AI Program, so uploads from
// a program view land in its Documents tab; the server re-validates it.
export function ClientDocumentsList({
  documents,
  companyId,
  actorEmail,
  programId,
}: {
  documents: ClientDocument[];
  companyId: string;
  actorEmail: string | null;
  programId?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const [drag, setDrag] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [addingLink, setAddingLink] = useState(false);

  const myEmail = (actorEmail ?? "").toLowerCase();

  function update(id: number, patch: Partial<QueueItem>) {
    setQueue((q) => q.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    setError(null);
    const items = files.map((file) => ({ id: nextId.current++, file, progress: 0, status: "queued" as const }));
    setQueue((q) => [...items, ...q]);
    for (const it of items) {
      update(it.id, { status: "uploading", progress: 0 });
      const signed = await teamSignedClientDocumentUpload({ companyId, filename: it.file.name, programId: programId ?? null });
      if (!signed.ok) {
        update(it.id, { status: "error", error: signed.error });
        continue;
      }
      const put = await putToSignedUrl(signed.signedUrl, it.file, (p) => update(it.id, { progress: p }));
      if (!put.ok) {
        update(it.id, { status: "error", error: put.error });
        continue;
      }
      const rec = await teamRecordClientDocument({
        companyId,
        path: signed.path,
        filename: it.file.name,
        sizeBytes: it.file.size,
        programId: programId ?? null,
      });
      update(it.id, rec.ok ? { status: "done", progress: 1 } : { status: "error", error: rec.error });
    }
    setQueue((q) => q.filter((it) => it.status !== "done"));
    router.refresh();
  }

  async function addLink() {
    if (!linkUrl.trim() || addingLink) return;
    setError(null);
    setAddingLink(true);
    const r = await teamAddClientLink({ companyId, url: linkUrl, title: linkTitle || null });
    setAddingLink(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setLinkUrl("");
    setLinkTitle("");
    router.refresh();
  }

  async function download(id: string) {
    setError(null);
    setBusyId(id);
    const r = await teamDownloadClientDocument(id);
    setBusyId(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    window.open(r.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      <div
        className={`admin-gallery-drop u-mb-3${drag ? " is-drag" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          addFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <span className="admin-gallery-drop-ico" aria-hidden>⬆</span>
        <span className="admin-gallery-drop-title">Drag files here, or click to browse</span>
        <span className="admin-gallery-drop-sub">PDF, Word, slides, spreadsheets, text · up to 25 MB each</span>
        <input ref={inputRef} type="file" multiple hidden onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); if (inputRef.current) inputRef.current.value = ""; }} />
      </div>

      <div className="admin-doc-link-row u-mb-3">
        <input
          className="admin-input admin-doc-link-url"
          type="url"
          placeholder="Paste a link (https://…)"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addLink()}
        />
        <input
          className="admin-input admin-doc-link-title"
          type="text"
          placeholder="Title (optional)"
          value={linkTitle}
          onChange={(e) => setLinkTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addLink()}
        />
        <button type="button" className="admin-btn" onClick={addLink} disabled={addingLink || !linkUrl.trim()}>
          {addingLink ? "Adding…" : "Add link"}
        </button>
      </div>

      {queue.length > 0 && (
        <div className="admin-list u-mb-3">
          {queue.map((it) => (
            <div className="admin-list-row" key={it.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">{it.file.name}</div>
                <div className="admin-list-sub">
                  {it.status === "error" ? (
                    <span className="u-err">{it.error}</span>
                  ) : it.status === "uploading" ? (
                    `Uploading… ${Math.round(it.progress * 100)}%`
                  ) : (
                    formatBytes(it.file.size)
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {documents.length === 0 ? (
        <div className="admin-empty">No documents yet. Upload the first one above.</div>
      ) : (
        <div className="admin-list">
          {documents.map((d) => (
            <div className="admin-list-row" key={d.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">{d.filename}</div>
                <div className="admin-list-sub">
                  {formatDay(d.createdAt)}
                  {(d.uploaderName || d.uploadedBy) && ` · uploaded by ${d.uploaderName ?? d.uploadedBy}`}
                  {d.url && ` · ${linkHost(d.url)}`}
                  {d.sizeBytes != null && ` · ${formatBytes(d.sizeBytes)}`}
                  {d.programName && ` · ${d.programName}`}
                </div>
              </div>
              <div className="admin-list-aside">
                {d.url ? (
                  <ExternalLink className="admin-btn admin-btn--sm" href={d.url}>
                    Open
                  </ExternalLink>
                ) : (
                <button
                  type="button"
                  className="admin-btn admin-btn--sm"
                  onClick={() => download(d.id)}
                  disabled={busyId === d.id}
                >
                  {busyId === d.id ? "…" : "Download"}
                </button>
                )}
                {myEmail !== "" && (d.uploadedBy ?? "").toLowerCase() === myEmail && (
                  <ConfirmButton
                    label="Delete"
                    className="admin-btn admin-btn--sm admin-btn--danger"
                    title={`Delete "${d.filename}"?`}
                    body="This cannot be undone."
                    confirmLabel="Delete"
                    disabled={busyId === d.id}
                    onConfirm={() => teamDeleteOwnClientDocument(d.id)}
                    onDone={() => router.refresh()}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <div className="admin-alert admin-alert--err u-mt-3">{error}</div>}
    </div>
  );
}
