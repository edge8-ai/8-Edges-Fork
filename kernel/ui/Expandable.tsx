"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

// Clamp long content to a fixed height with a fade and a Show more / Show less
// toggle. The toggle only appears when the content actually overflows, measured
// from an inner wrapper (which always lays out at full height, so the check is
// stable whether or not the outer box is currently clamped). A ResizeObserver
// re-checks when the content changes (e.g. an edited assessment is saved).
export function Expandable({
  children,
  collapsedHeight = 220,
}: {
  children: ReactNode;
  collapsedHeight?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setOverflowing(el.scrollHeight > collapsedHeight + 8);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [collapsedHeight]);

  const clamped = overflowing && !expanded;
  return (
    <div>
      <div
        className={`admin-record-expand${clamped ? " admin-record-expand--clamped" : ""}`}
        style={{ maxHeight: clamped ? collapsedHeight : undefined }} /* layout-ok: data-driven clamp height */
      >
        <div ref={innerRef}>{children}</div>
      </div>
      {overflowing && (
        <button
          type="button"
          className="admin-record-expand-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
