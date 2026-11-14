"use client";

import { useId, useState, type ReactNode } from "react";

// One closed role (TH.18): always listed with its outcome; its candidates open
// under it on request, so twenty-five roles stay a list you can read at once.
export function ClosedRoleToggle({
  title,
  meta,
  outcome,
  hasCandidates,
  children,
}: {
  title: string;
  meta: string;
  outcome: { className: string; label: string };
  hasCandidates: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <li className={open ? "hr-closed-row is-open" : "hr-closed-row"}>
      <div className="u-min-0">
        <p className="hr-closed-t">{title}</p>
        <p className="hr-meta">{meta}</p>
      </div>
      <span className={outcome.className}>{outcome.label}</span>
      {hasCandidates ? (
        <button type="button" className="hr-link" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Candidates"}
        </button>
      ) : (
        <span />
      )}
      {open && (
        <div id={id} className="hr-closed-body">
          {children}
        </div>
      )}
    </li>
  );
}
