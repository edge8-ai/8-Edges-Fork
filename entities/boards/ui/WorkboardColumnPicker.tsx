"use client";

import type { KanbanColumn } from "@/kernel/ui/KanbanBoard";

/**
 * One column at a time, on a phone (W.64).
 *
 * `.admin-kanban` is a horizontal flex scroll of 252px-minimum columns. At
 * 390px that is two-thirds of one column and a horizontal scrollbar, under a
 * toolbar that has already taken the screen. Reading the board sideways
 * through a 100px window is not reading the board.
 *
 * Below the tablet breakpoint the board shows the chosen column and this
 * picks it. EVERY COLUMN STAYS IN THE MARKUP — the others are hidden by CSS
 * at that width only — so the drag context is whole, the desktop board is
 * untouched, and nothing here runs or renders differently on a wide screen.
 * This control is `display: none` above the breakpoint.
 *
 * Its counts are the board's counts, passed in, so the number on the tab and
 * the number in the column header can never disagree — including while a
 * move is being written and the count is deliberately held still (W.49).
 */
export function WorkboardColumnPicker({
  columns,
  activeId,
  countFor,
  onSelect,
}: {
  columns: KanbanColumn[];
  activeId: string;
  countFor: (columnId: string) => number;
  onSelect: (columnId: string) => void;
}) {
  if (columns.length < 2) return null;
  return (
    <div className="wb-colpicker" role="tablist" aria-label="Which column to show">
      {columns.map((c) => (
        <button
          key={c.id}
          type="button"
          role="tab"
          aria-selected={c.id === activeId}
          className={`wb-colpicker-tab${c.id === activeId ? " is-active" : ""}`}
          onClick={() => onSelect(c.id)}
        >
          {c.label}
          <span className="wb-colpicker-count">{countFor(c.id)}</span>
        </button>
      ))}
    </div>
  );
}
