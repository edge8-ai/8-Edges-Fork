"use client";

import { useEffect, useState } from "react";
import { measureOf, type GoalDirection } from "@/entities/coaching/lib/goal-measure";
import { signedDelta } from "@/entities/coaching/lib/key-result-move";

// The company rung's own number, and what it did since the member's last 1-1
// (K.43). "100 more people joined" is the thing that should pull someone back
// to the page and make them bump their own number, and it can only do that if
// the rung above the goal shows the movement rather than a static relationship.
//
// The highlight is one-time by construction, not by storage: the class goes on
// after mount, so the animation plays once per visit and nothing is written
// anywhere to remember that it played. It is a movement on the page, never a
// badge or a count that sits there afterwards. Under prefers-reduced-motion the
// CSS drops the animation and the line simply is there.
//
// Every number here belongs to the company key result. Nothing says who moved
// it, and nothing about the member is measured by it.

export function CompanyRungMove({
  current,
  target,
  unit,
  move,
  direction,
}: {
  current: number;
  target: number | null;
  unit: string | null;
  // Null when the audit trail holds no value for the window since the last
  // 1-1, which is also the case before the first one: then the rung shows the
  // number alone and claims no movement.
  move: { previous: number; delta: number } | null;
  // A key result marked down reads as heading down to its target (K.78).
  direction: GoalDirection;
}) {
  const moved = move !== null && move.delta !== 0;
  const [lit, setLit] = useState(false);
  useEffect(() => {
    if (moved) setLit(true);
  }, [moved]);

  const suffix = unit ? ` ${unit}` : "";
  return (
    <div className={`coach-rung-move${lit ? " coach-rung-move--lit" : ""}`}>
      <span className="coach-rung-move-now">
        {measureOf({ current, target, unit, direction }) ?? `${current}${suffix}`}
      </span>
      {moved && (
        <span className="coach-rung-move-delta">
          {move.previous} → {current}
          {suffix} · {signedDelta(move.delta)} since your last 1-1
        </span>
      )}
    </div>
  );
}
