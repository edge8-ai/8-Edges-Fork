"use client";

// A bounty's HP bar (QS.1). HP is the share of the Party still out and only
// ever goes down, so a change is always a drain: the fill drops at once and an
// amber ghost follows it down a beat later (the prototype's ghost bar).
//
// The bar is an SVG whose rects take their width as an attribute, so the
// server draws the true HP with no inline style (check:design-ratchet allows
// a new file none) and the page is right before any script runs. The drain is
// an enhancement on top: the Web Animations API plays it from the HP this
// component last drew, and does nothing when the reader asked for less motion.
import { useEffect, useRef } from "react";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HpBar({ hp, label, variant = "arena" }: { hp: number; label: string; variant?: "arena" | "row" | "mini" }) {
  const shown = Math.max(0, Math.min(100, hp));
  const last = useRef(shown);
  const fill = useRef<SVGRectElement>(null);
  const ghost = useRef<SVGRectElement>(null);

  useEffect(() => {
    const from = last.current;
    last.current = shown;
    if (from <= shown || reducedMotion()) return;
    // CSS px in an SVG's user space are its user units, so these widths are HP points.
    fill.current?.animate([{ width: `${from}px` }, { width: `${shown}px` }], { duration: 350, easing: "ease-out" });
    ghost.current?.animate([{ width: `${from}px` }, { width: `${from}px`, offset: 0.3 }, { width: `${shown}px` }], { duration: 1250, easing: "cubic-bezier(.2,.8,.2,1)" });
  }, [shown]);

  return (
    <div className={`qs-hpbar qs-hpbar--${variant}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={shown}>
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
        {variant !== "mini" && <rect ref={ghost} className="qs-hpbar-ghost" x="0" y="0" width={shown} height="10" />}
        <rect ref={fill} className="qs-hpbar-fill" x="0" y="0" width={shown} height="10" />
      </svg>
    </div>
  );
}
