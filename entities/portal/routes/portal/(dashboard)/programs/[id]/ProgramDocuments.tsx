"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { downloadDocumentAction } from "../actions";
import { deleteOwnDocumentAction } from "../../documents/actions";
import { formatBytes, formatDate } from "@/kernel/ui/format";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { ExternalLink } from "@/kernel/ui/ExternalLink";

import type { PortalDocumentRow } from "@/entities/portal/lib/document-rows";

// The client-facing document list, laid out like the admin hub's Documents
// tab (name, then date · uploader · size). Files open via a short-lived signed
// URL minted server-side (private bucket), so links can't be shared or
// guessed. Delete is uploader-only: the button renders only for your own
// uploads and the server re-checks anyway.
// The rows arrive built on the server (portalDocumentRows), carrying no
// uploader email: this component's props are in the page payload.
export function ProgramDocuments({ documents }: { documents: PortalDocumentRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open(id: string) {
    setError(null);
    setBusyId(id);
    const r = await downloadDocumentAction(id);
    setBusyId(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    window.open(r.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      <div className="admin-list">
        {documents.map((d) => {
          const meta = [
            formatDate(d.createdAt),
            // The name only, never the stored email (S.16.21): an uploader
            // the portal cannot name is simply not mentioned.
            d.uploaderName ? `uploaded by ${d.uploaderName}` : null,
            d.sizeBytes != null ? formatBytes(d.sizeBytes) : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <div className="admin-list-row" key={d.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">{d.filename}</div>
                <div className="admin-list-sub">{meta}</div>
              </div>
              <div className="admin-list-aside">
                {d.url ? (
                  <ExternalLink href={d.url} className="admin-btn admin-btn--sm">
                    Open
                  </ExternalLink>
                ) : (
                  <button type="button" className="admin-btn admin-btn--sm" onClick={() => open(d.id)} disabled={busyId === d.id}>
                    {busyId === d.id ? "…" : "Download"}
                  </button>
                )}
                {d.isMine && (
                  <ConfirmButton
                    label="Delete"
                    className="admin-btn admin-btn--sm admin-btn--danger"
                    title={`Delete "${d.filename}"?`}
                    body="This cannot be undone."
                    confirmLabel="Delete"
                    disabled={busyId === d.id}
                    onConfirm={() => deleteOwnDocumentAction(d.id)}
                    onDone={() => router.refresh()}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {error && <div className="admin-alert admin-alert--err u-mt-3">{error}</div>}
    </div>
  );
}
