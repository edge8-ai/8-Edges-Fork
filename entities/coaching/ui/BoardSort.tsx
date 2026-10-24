"use client";

import { SORT_LABELS, SORT_MODES, type SortMode } from "@/entities/coaching/lib/stack-order";

// How the board is ordered (K.66). One control for the board rather than one
// per column: a member thinks "show me what is due", not "show me what is due
// in On it". "My order" is the drag stack, and it is the default, because the
// order a person put their own work in is the one they recognise.
export function BoardSort({ mode, onChange }: { mode: SortMode; onChange: (mode: SortMode) => void }) {
  return (
    <label className="coach-sort">
      <span className="coach-sort-label">Order</span>
      <select
        className="admin-select coach-sort-select"
        value={mode}
        onChange={(e) => onChange(e.target.value as SortMode)}
      >
        {SORT_MODES.map((m) => (
          <option key={m} value={m}>
            {SORT_LABELS[m]}
          </option>
        ))}
      </select>
    </label>
  );
}
