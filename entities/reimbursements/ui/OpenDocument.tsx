"use client";

import { useState, useTransition } from "react";

// Opens a receipt or red invoice in a new tab with a link signed when clicked:
// the links the page rendered with last a minute, and checking a long claim
// takes longer than that. The signer is the page's own server action, handed
// in (nothing under ui/ may import a route), so each surface signs behind its
// own permission: the checker's, or Admin's view.
export function OpenDocument({
  claimId,
  fileId,
  label,
  openFile,
}: {
  claimId: string;
  fileId: string;
  label: string;
  openFile: (claimId: string, fileId: string) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const open = () =>
    start(async () => {
      setError(null);
      // Opened before the await, so the browser treats it as the click's own window.
      const tab = window.open("", "_blank");
      const res = await openFile(claimId, fileId);
      if (!res.ok) {
        tab?.close();
        return setError(res.error);
      }
      if (tab) tab.location.href = res.url;
      else window.location.href = res.url;
    });
  return (
    <span className="u-stack u-gap-1">
      <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={open}>
        Open {label}
      </button>
      {error && <span className="admin-alert admin-alert--err">{error}</span>}
    </span>
  );
}
