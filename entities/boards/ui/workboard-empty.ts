import type { FilterPart } from "./workboard-filter-parts";

// The words behind the Workboard's three kinds of nothing (W.47), kept apart
// from the component that draws them so each sentence can be asserted on
// directly. WorkboardEmptyState.tsx renders these; nothing else should.

/** What an empty column says: what belongs in it, or why nothing here survived. */
export function emptyColumnLabel(columnLabel: string, filtersActive: boolean): string {
  return filtersActive ? `Nothing in ${columnLabel} matches the filters` : `Nothing in ${columnLabel}`;
}

/** The list view's one empty row, which has the same three cases minus the column. */
export function emptyRowLabel(boardHasCards: boolean, filtersActive: boolean): string {
  if (!boardHasCards) return "No cards on this board yet.";
  return filtersActive ? "No cards match the filters." : "No cards.";
}

// The filtered-to-nothing sentence, built from the same parts the filter
// sentence above the board is built from (W.46's filterParts). Naming them
// here in prose rather than as a second row of dismiss buttons is deliberate:
// each part already carries its own undo a few pixels above, and repeating
// that row would say the same thing twice. What this line adds is the two
// things that row cannot say — that the board is not empty, the filters are,
// and one button that puts every card back.
export function filteredToNothingLine(totalCards: number, parts: FilterPart[]): string {
  const named = parts.map((p) => p.label);
  const list =
    named.length === 0
      ? "the filters"
      : named.length === 1
        ? named[0]
        : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  const subject = totalCards === 1 ? "The one card on this board does not match" : `None of the ${totalCards} cards on this board match`;
  return `${subject} ${list}.`;
}

/** The button that puts the cards back, which says how much it is undoing. */
export function clearFiltersLabel(parts: FilterPart[]): string {
  return parts.length === 1 ? "Clear this filter" : "Clear all filters";
}
