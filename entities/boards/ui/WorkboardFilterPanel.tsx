"use client";

import { useState } from "react";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { WorkboardFilterControls } from "./WorkboardFilterControls";
import { controlsCount, type FilterControlDef } from "./workboard-filter-controls";

/**
 * The filter row, folded (W.89) — at EVERY width since W.103.5.
 *
 * It began as a phone fix: below the tablet breakpoint seven pickers wrapped
 * onto three lines and pushed the board off the screen, so they collapsed into
 * one button saying how many filters are on, with the same controls in a
 * slide-over. On a desktop the row stayed, and it was still the thing that
 * made the toolbar two rows and 103px tall.
 *
 * SO THE FOLD IS NOW UNCONDITIONAL, and the row it replaces is gone. Seven
 * pickers spend permanent width saying what you COULD narrow by; the button
 * spends one control's worth saying what you HAVE narrowed by, which is the
 * only one of those two a reader wants at rest. Nothing is harder to reach: it
 * was always one click to change a filter and it still is.
 *
 * WHAT THIS COSTS, said plainly: on a desktop the panel is a side-car over the
 * right of the board while it is open, where before it could not open there at
 * all. It closes on Escape, on the backdrop and on its own button, and the
 * board is not interactive underneath it either way.
 *
 * Dismissal, the backdrop, Escape and the close button are DetailDrawer's,
 * the admin's one side-car (admin-consistency-playbook.md).
 */
export function WorkboardFilterPanel({ defs, onClear, filtersActive }: { defs: FilterControlDef[]; onClear: () => void; filtersActive: boolean }) {
  const [open, setOpen] = useState(false);
  const count = controlsCount(defs);

  return (
    <>
      <button
        type="button"
        className={`admin-btn admin-btn--sm admin-boardfilters-toggle${count > 0 ? " is-filtering" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Filters{count > 0 ? ` (${count})` : ""}
      </button>
      <DetailDrawer
        open={open}
        onClose={() => setOpen(false)}
        eyebrow="Board"
        title="Filters"
        action={
          filtersActive ? (
            <button type="button" className="admin-auth-link" onClick={onClear}>
              Clear all
            </button>
          ) : undefined
        }
      >
        <div className="u-stack u-gap-4">
          <WorkboardFilterControls defs={defs} stacked />
        </div>
      </DetailDrawer>
    </>
  );
}
