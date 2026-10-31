"use client";

import { useEffect, useState } from "react";

// The ~20s wait while Claude writes the product plan. Purely cosmetic: the
// server action emits no progress events, so stages advance on a timer and the
// last one holds until the redirect lands. The document "writes itself": two
// skeleton lines per stage plus a blinking caret, walking the same four Ds the
// submitter just answered.

const STAGES = [
  { d: "Define", label: "Restating the problem in plain language…" },
  { d: "Discover", label: "Mapping the data your idea needs…" },
  { d: "Design", label: "Walking the workflow, step by step…" },
  { d: "Determine", label: "Drafting the FAST goal and finishing your plan…" },
];

// Varied widths so the skeleton reads as prose, not a barcode.
const LINE_WIDTHS = [92, 71, 84, 58, 88, 76, 64, 42];

const STAGE_MS = 4800;

export function PlanGenerating() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), STAGE_MS);
    return () => clearInterval(t);
  }, []);

  const visibleLines = (stage + 1) * 2;

  return (
    <div className="admin-card admin-idea-gen" role="status">
      <h2 className="admin-card-title">Building your product plan</h2>
      <p className="admin-page-sub u-mt-2">
        Your idea is safely saved. Claude is turning it into a product plan, which takes about 20
        seconds.
      </p>

      <ol className="admin-idea-gen-steps" aria-hidden="true">
        {STAGES.map((s, i) => (
          <li
            key={s.d}
            className={`admin-idea-gen-step${i < stage ? " is-done" : ""}${i === stage ? " is-active" : ""}`}
          >
            <span className="admin-idea-gen-dot" />
            {s.d}
          </li>
        ))}
      </ol>

      <div className="admin-idea-gen-doc" aria-hidden="true">
        {LINE_WIDTHS.slice(0, visibleLines).map((w, i) => (
          <span
            key={i}
            className={`admin-idea-gen-line${i === visibleLines - 1 ? " is-fresh" : ""}`}
            style={{ width: `${w}%` }} /* layout-ok: data-driven width */
          />
        ))}
        <span className="admin-idea-gen-caret" />
      </div>

      <p className="admin-idea-gen-status" aria-live="polite">{STAGES[stage].label}</p>
    </div>
  );
}
