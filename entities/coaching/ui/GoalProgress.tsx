"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMyGoalProgress } from "@/entities/coaching/lib/my-actions";
import { goalMoment, type GoalMoment } from "@/entities/coaching/lib/goal-moment";
import { goalProgressPct } from "@/entities/coaching/lib/goal-percent";

// The goal's number, bumped where the goal lives (K.41), and the bar that
// answers it (K.42). The news comes in, you open the page, you put the new
// number in, and two things happen: the page says something back — the move,
// the share of the way, what is left — and the bar travels from where it was
// to where it now is. The travel is the point; a bar that jumps says nothing.
//
// The bar is a div rather than a native <progress> because only a width can be
// transitioned, and the width is set through a ref so no inline style object
// enters the tree. Its role/aria attributes carry the same value a <progress>
// would have carried. Under prefers-reduced-motion the CSS drops the
// transition and the bar simply arrives.

export function GoalProgress({
  goalId,
  current,
  start,
  target,
  unit,
  pct,
  onAddTarget,
}: {
  goalId: string;
  current: number | null;
  start: number | null;
  target: number | null;
  unit: string | null;
  // The share of the way the server rendered, or null when the goal has no
  // measure typed and therefore shows no bar at all.
  pct: number | null;
  // Where "Add a target" goes on a goal with no target: the goal's edit form,
  // or the tab that holds it. Without it the line says only that there is none.
  onAddTarget?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current === null ? "" : String(current));
  const [moment, setMoment] = useState<GoalMoment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(pct);
  const [pending, startTransition] = useTransition();
  const fill = useRef<HTMLSpanElement | null>(null);

  // The first paint puts the fill at zero and this effect moves it to the
  // loaded value, so opening the page fills the bar once; a later bump moves
  // it from wherever it stands to the new share.
  useEffect(() => {
    if (fill.current) fill.current.style.width = `${shown ?? 0}%`;
  }, [shown]);

  const save = () => {
    const n = Number(value);
    setError(null);
    startTransition(async () => {
      const res = await updateMyGoalProgress(goalId, n);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMoment(goalMoment({ before: current, after: n, start, target, unit }));
      setShown(goalProgressPct({ startValue: start, currentValue: n, targetValue: target }));
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <div className="coach-progress">
      {pct !== null && (
        <div
          className="coach-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={shown ?? 0}
          aria-label={`${shown ?? 0}% of target`}
        >
          <span className="coach-bar-fill" ref={fill} />
        </div>
      )}
      {moment && (
        <div className={`coach-moment coach-moment--${moment.tone}`} role="status">
          <span className="coach-moment-head">{moment.headline}</span>
          <span className="coach-moment-body">{moment.detail}</span>
        </div>
      )}
      {/* A goal with no target has nothing to measure a number against, so
          "Update my number" would ask for a figure that can mean nothing (K.78).
          It asks for the target instead. */}
      {target === null ? (
        <div className="coach-progress-actions coach-progress-none">
          <span className="admin-cell-muted">
            No target yet. Give this goal a number to aim for and it will show how far you have come.
          </span>
          {onAddTarget && (
            <button type="button" className="coach-pill" onClick={onAddTarget}>
              Add a target
            </button>
          )}
        </div>
      ) : open ? (
        <div className="admin-coach-add-row">
          <input
            className="admin-input coach-progress-input"
            type="number"
            inputMode="decimal"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
            aria-label={`Where I am now${unit ? ` (${unit})` : ""}`}
            autoFocus
          />
          <button type="button" className="coach-pill" disabled={pending || value === ""} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" className="admin-link-btn" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="coach-progress-actions">
          <button type="button" className="coach-pill" onClick={() => setOpen(true)}>
            Got news? Update my number
          </button>
        </div>
      )}
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
    </div>
  );
}
