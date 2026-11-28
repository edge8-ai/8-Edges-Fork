import type { KanbanColumn } from "@/kernel/ui/KanbanBoard";
import type { Card } from "./board-view-types";
import type { WorkboardMoveState } from "./useWorkboardDrag";

// What a Workboard column HEAD says about itself: the number in it, and
// whether the reader has folded it. Both are answers the board works out
// before it draws anything, and both were inline arithmetic in
// WorkboardKanban.tsx — which decides what the board DOES (the drag contract,
// the card treatment, the sections). This file decides what its columns SAY.

/**
 * A column's count, held still while a move is being written (W.49).
 *
 * A card that is being written has already moved on screen, so the
 * destination is counted one too many and the origin one too few until the
 * answer comes back. The returned function undoes that, per column.
 *
 * Only a card the filters are actually DRAWING is corrected for: one the
 * filters have hidden never entered a count, so "undoing" its move would take
 * the column a card below what it holds.
 *
 * The pending moves are LANE moves, so under any other grouping (W.25) their
 * from/to match no column on screen and the correction is simply zero — which
 * is right: a grouped drop writes a field rather than a lane, and the column
 * it lands in is already showing it.
 */
export function columnCounter(cards: Card[], moveState: WorkboardMoveState): (columnId: string, drawn: number) => number {
  const drawnIds = new Set(cards.map((c) => c.id));
  const inFlight = Object.entries(moveState.pending)
    .filter(([cardId]) => drawnIds.has(cardId))
    .map(([, move]) => move);
  return (columnId, drawn) =>
    drawn + inFlight.filter((m) => m.from === columnId).length - inFlight.filter((m) => m.to === columnId).length;
}

/**
 * The folded columns (W.92.4), narrowed to the ones actually on screen.
 *
 * `?collapsed=` is the one value the URL codec reads without a vocabulary,
 * because a column id depends on the grouping the codec is decoding beside it
 * (workboard-filter-params.ts says why). This is the layer that knows what
 * the columns are, so this is where an id that names none of them comes to
 * nothing — a stale link shows the board rather than a board of strips.
 */
export function foldedColumns(collapsed: readonly string[], columns: KanbanColumn[]): Set<string> {
  const onScreen = new Set(columns.map((c) => c.id));
  return new Set(collapsed.filter((id) => onScreen.has(id)));
}

/**
 * Everything one column can be saying at once, as classes.
 *
 * Four states, and they compose — a column can have just taken a card, be
 * under a sort, be folded and be the one a phone is showing, all at the same
 * time. This is the column's twin of workboard-card-classes.ts, and it is
 * here for the same reason: the list reads better gathered than inline, and
 * the states that are easy to confuse get somewhere to be told apart.
 *
 * `is-collapsed` is a CLASS and nothing else, deliberately. The column keeps
 * its Droppable and its body keeps the min-height that makes it a measurable
 * drop target, so a folded column still takes a card — which is the whole
 * reason to fold one while dragging past it (W.92.4).
 */
export function columnClasses(
  column: KanbanColumn,
  {
    landedLane,
    manualOrder,
    folded,
    phoneColumnId,
  }: {
    /** The lane a card just landed in (W.49). */
    landedLane: string | null;
    /** The within-column order is the manual one rather than a sort (W.27). */
    manualOrder: boolean;
    folded: ReadonlySet<string>;
    /** The column a phone is showing (W.64); no effect above the tablet breakpoint. */
    phoneColumnId: string;
  },
): string | undefined {
  return (
    [
      landedLane === column.id ? "is-landed" : "",
      manualOrder ? "" : "is-sorted",
      folded.has(column.id) ? "is-collapsed" : "",
      column.id === phoneColumnId ? "is-phone-shown" : "",
    ]
      .filter(Boolean)
      .join(" ") || undefined
  );
}

/**
 * Which of the columns on screen are the DONE lane, for the fold (W.55).
 *
 * Empty under any grouping but the lanes: "everything finished before this
 * sprint" is a statement about a done column, and the "P1" column is not one.
 * The empty answer is a shared constant rather than a fresh Set, so a board
 * under a grouping does not hand the kanban a new value on every render.
 */
export function doneLaneIds(grouping: string, lanes: { id: string; isDone: boolean }[]): ReadonlySet<string> {
  return grouping === "lane" ? new Set(lanes.filter((l) => l.isDone).map((l) => l.id)) : NO_COLUMNS;
}

/**
 * The lanes a card leaves the work in: Done, and Not Doing (W.139). Both are
 * drawn by the same window, since a lane of cards set aside grows as surely as
 * a lane of finished ones. Kept apart from `doneLaneIds` because the rest of
 * Done's rules (its day sections, "All done →") are about finished work.
 */
export function closedLaneIds(grouping: string, lanes: { id: string; isDone: boolean; isNotDoing?: boolean }[]): ReadonlySet<string> {
  return grouping === "lane" ? new Set(lanes.filter((l) => l.isDone || l.isNotDoing).map((l) => l.id)) : NO_COLUMNS;
}

const NO_COLUMNS: ReadonlySet<string> = new Set();
