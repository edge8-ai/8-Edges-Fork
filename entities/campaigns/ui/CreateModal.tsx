"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// A "+ New …" button that opens its form in a modal, so an index page stays a
// list and the form gets labelled fields and room to breathe. The markup is
// the broadcast modal's; this is the one home for it from here on.
export function CreateModal({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" className="admin-btn admin-btn--primary" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="admin-campaign-modal-overlay" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
            <div className="admin-campaign-modal-card">
              <div className="admin-campaign-modal-head">
                <span className="admin-campaign-modal-title">{title}</span>
                <button type="button" className="admin-btn admin-btn--sm" onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>
              <div className="admin-campaign-modal-body">{children}</div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
