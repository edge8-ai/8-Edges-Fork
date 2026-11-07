"use client";

import { useState, useTransition } from "react";
import { formatBytes } from "@/kernel/ui/format";
import type { MyItem } from "@/entities/reimbursements/lib/my-claims";
import { DOCUMENT_KIND_LABEL, ITEM_DOCUMENT_KINDS, documentLabel, type DocumentKind } from "@/entities/reimbursements/lib/claim-labels";
import { hasJoined } from "@/entities/reimbursements/lib/join-rules";
import { ReplacedBadge } from "@/entities/reimbursements/ui/ItemTags";
import { openOwnFile } from "../actions";

// A receipt's files, each named by what it is and opened by clicking its name
// (RB.26). Files are added only through the claim's one drop zone, which reads
// each one; nothing here uploads, so a row carries no picker and no per-file
// buttons. In Edit, `onKind` turns each current file's name into a picker set
// to what the AI read it as, which its owner can change (RB.26.6: the read is a
// default, never the last word); a photo is never a red invoice, so that choice
// is shown and disabled. `onUnjoin` gives a joined bank deduction or red
// invoice its one action, Unjoin. A replaced file stays listed, marked,
// satisfying nothing (20261008090000).
export function ItemDocuments({
  item,
  kinds,
  onKind,
  onUnjoin,
  pending = false,
}: {
  item: MyItem;
  /** The kinds Edit holds while they are being changed, by file id; the saved kind otherwise. */
  kinds?: Record<string, DocumentKind>;
  onKind?: (fileId: string, kind: DocumentKind) => void;
  onUnjoin?: (fileId: string) => void;
  pending?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [opening, start] = useTransition();
  const current = item.documents.filter((d) => !d.replacedAt);
  const unjoinable = (kind: string) => (kind === "bank_deduction" || kind === "red_invoice") && hasJoined(item.documents, kind);

  const open = (fileId: string) =>
    start(async () => {
      setError(null);
      const res = await openOwnFile(fileId);
      if (!res.ok) return setError(res.error);
      window.open(res.url, "_blank", "noopener");
    });

  return (
    <div className="u-stack u-gap-1">
      {item.documents.length === 0 && <span className="admin-hint">No document yet.</span>}
      {item.documents.map((doc) => {
        const name = (
          <>
            <button type="button" className="admin-link-btn" disabled={opening} onClick={() => open(doc.id)}>
              {doc.filename}
            </button>
            {doc.sizeBytes !== null && <span className="admin-cell-muted"> · {formatBytes(doc.sizeBytes)}</span>} {doc.replacedAt && <ReplacedBadge />}
          </>
        );
        const pdf = doc.mimeType === "application/pdf";
        return (
          <div key={doc.id} className="u-row u-between u-items-center u-gap-1 u-wrap">
            {onKind && !doc.replacedAt ? (
              <span className="u-row u-gap-1 u-items-center u-min-0">
                <select
                  className="admin-select u-w-auto"
                  aria-label={`What ${doc.filename} is`}
                  value={kinds?.[doc.id] ?? doc.kind}
                  disabled={pending}
                  onChange={(e) => onKind(doc.id, e.target.value as DocumentKind)}
                >
                  {ITEM_DOCUMENT_KINDS.map((k) => (
                    <option key={k} value={k} disabled={k === "red_invoice" && !pdf}>
                      {k === "red_invoice" && !pdf ? "Red invoice (PDF only)" : DOCUMENT_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
                <span className="u-min-0 u-truncate">{name}</span>
              </span>
            ) : (
              <span className="u-min-0 u-truncate">
                <span className="u-strong">{documentLabel(doc.kind, current)}</span> · {name}
              </span>
            )}
            {onUnjoin && !doc.replacedAt && unjoinable(doc.kind) && (
              <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost" disabled={pending} onClick={() => onUnjoin(doc.id)}>
                Unjoin
              </button>
            )}
          </div>
        );
      })}
      {error && (
        <div className="admin-alert admin-alert--err" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
