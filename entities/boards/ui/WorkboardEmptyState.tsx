"use client";

import type { WorkboardData } from "@/entities/boards/lib/workboard";
import type { WorkboardFilters } from "./useWorkboardFilters";
import { filterNames, filterParts } from "./workboard-filter-parts";
import { clearFiltersLabel, filteredToNothingLine } from "./workboard-empty";

// The three kinds of nothing (W.47). A board with no cards, a board whose
// filters match none of them, and a column with nothing in it are three
// different situations, and before this they all rendered as the same blank
// well. Each gets its own line: the two board-wide cases here, the column case
// as the label WorkboardKanban hands the kernel's emptyLabel.
//
// The filtered case reads off the same filterParts as the filter sentence
// above the board (W.46), so the two can never name a filter differently. It
// does not repeat that row's dismiss buttons — each part already carries its
// own undo a few pixels up. It says the two things that row cannot: that the
// board is not empty, the filters are, and one button that puts every card
// back, where the reader is actually looking.
export function WorkboardEmptyState({
  data,
  f,
  canAdd,
  onNewCard,
}: {
  data: WorkboardData;
  f: WorkboardFilters;
  canAdd: boolean;
  onNewCard: () => void;
}) {
  // Something survived the filters, so the board speaks for itself.
  if (f.cards.length > 0) return null;

  // Case one: the board itself is empty. Nothing to clear, so say how a first
  // card is made rather than offering a way out of a filter nobody set.
  if (data.cards.length === 0) {
    return (
      <div className="admin-empty admin-empty--tall">
        <p>No cards on this board yet.</p>
        {canAdd ? (
          <>
            <p>A card is a piece of work: give it a title, a lane and whoever is doing it.</p>
            <p className="u-mt-2">
              <button type="button" className="admin-btn admin-btn--primary" onClick={onNewCard}>
                + New card
              </button>
            </p>
          </>
        ) : (
          <p>When work is added to it, it shows up here.</p>
        )}
      </div>
    );
  }

  // Case two: cards exist and the filters hide all of them.
  const parts = filterParts(f, filterNames(data, f));
  if (parts.length === 0) return null;
  return (
    <div className="admin-empty admin-empty--tall">
      <p>{filteredToNothingLine(data.cards.length, parts)}</p>
      <p className="u-mt-2">
        <button type="button" className="admin-btn admin-btn--sm" onClick={parts.length === 1 ? parts[0].remove : f.clearFilters}>
          {clearFiltersLabel(parts)}
        </button>
      </p>
    </div>
  );
}
