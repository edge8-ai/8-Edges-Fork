"use client";

import { useState } from "react";
import { APPLICATION_STATUS_OPTIONS, isDecisionStatus, PROPOSE_LABEL } from "@/entities/hiring/lib/application-status";

// The ⋯ overflow: full status control plus archive/restore, kept out of the
// primary action zone. Popover + full-screen click-catcher to dismiss.
export function OverflowMenu({
  status,
  onStatus,
  archived,
  onToggleArchive,
  proposeDecision = false,
}: {
  status: string;
  onStatus: (v: string) => void;
  archived: boolean;
  onToggleArchive: () => void;
  /** In a live hiring chain (Z.9), Hired and Rejected become "Propose…", which opens the Decision card. */
  proposeDecision?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="admin-record-menu-wrap">
      <button
        type="button"
        className="admin-record-iconbtn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="admin-record-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="admin-record-menu" role="menu">
            <div className="admin-section-label u-p-1">
              Set status
            </div>
            {APPLICATION_STATUS_OPTIONS.map(([v, l]) => {
              const propose = proposeDecision && v !== status && isDecisionStatus(v);
              return (
                <button
                  key={v}
                  type="button"
                  className="admin-record-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    if (propose) {
                      document.getElementById("decision")?.scrollIntoView({ block: "start" });
                      return;
                    }
                    if (v !== status) onStatus(v);
                  }}
                >
                  {v === status ? "✓ " : ""}
                  {propose ? PROPOSE_LABEL[v as "hired" | "rejected"] : l}
                </button>
              );
            })}
            <hr className="admin-hr" />
            <button
              type="button"
              className={`admin-record-menu-item${archived ? "" : " admin-record-menu-item--danger"}`}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onToggleArchive();
              }}
            >
              {archived ? "Restore to pipeline" : "Archive application"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
