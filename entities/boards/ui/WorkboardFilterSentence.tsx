"use client";

import { useMemo } from "react";
import type { WorkboardData } from "@/entities/boards/lib/workboard";
import type { WorkboardFilters } from "./useWorkboardFilters";
import { filterParts, filterNames } from "./workboard-filter-parts";
import { Icon } from "@/kernel/ui/Icon";

// What the board is showing, said once in words (W.46), above the board and
// under the toolbar. It replaces the toolbar's "12 of 371 cards" and its single
// clear-everything button: the count stays, but each thing that is narrowing
// the board now names itself and carries its own dismiss, so the reader learns
// WHY the board is narrow without reading back across seven pickers.
//
// Nothing narrowing the board means no sentence: removing the last part takes
// the whole row with it rather than leaving an empty bar.
export function WorkboardFilterSentence({ f, data, totalCards }: { f: WorkboardFilters; data: WorkboardData; totalCards: number }) {
  const names = useMemo(() => filterNames(data, f), [data, f]);
  const parts = filterParts(f, names);
  if (!f.filtersActive || parts.length === 0) return null;

  // Since W.174 it rides at the right end of the pulse strip (WorkboardPulse),
  // so its parts are soft chips in the accent's tint rather than buttons: they
  // are the values narrowing the board, each with its own way out.
  return (
    <div className="wb-filter-sentence">
      <span className="wb-filter-sentence-count">
        Showing <strong>{f.cards.length}</strong> of {totalCards}, filtered to
      </span>
      {parts.map((p) => (
        <button key={p.key} type="button" className="wb-filter-chip" onClick={p.remove} aria-label={`Remove filter ${p.label}`}>
          {p.label}
          <Icon name="close" />
        </button>
      ))}
      {parts.length > 1 && (
        <button type="button" className="wb-filter-clear" onClick={f.clearFilters}>
          Clear all
        </button>
      )}
    </div>
  );
}
