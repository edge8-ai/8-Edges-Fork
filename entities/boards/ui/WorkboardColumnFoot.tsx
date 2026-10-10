"use client";

import { SORT_SHORT } from "./workboard-sort";
import { WorkboardQuickAdd } from "./WorkboardQuickAdd";
import type { QuickAdd } from "./useWorkboardQuickAdd";
import type { SortId } from "./workboard-filter-params";

/**
 * The foot of a Workboard column: the way in for a new card, and the line
 * saying why dragging a card up it would not stick.
 *
 * No third thing, and in particular no figure. It briefly carried a Human
 * Token subtotal, then the card count in words, and both were cut: the sum
 * was a figure nobody acts on, and the count is already in the column header
 * a few hundred pixels above (Khoa, 2026-09-20). The `cardCount` prop below
 * is not printed anywhere — it is how quick-add knows its refresh landed.
 *
 * The way in is a title field on a single board and a button everywhere else
 * (W.92.8); WorkboardQuickAdd and useWorkboardQuickAdd say why.
 *
 * The sorted note is not decoration. Under a sort or a grouping the
 * within-column rank is not what orders the column, so a card dragged up
 * springs straight back — and a board that does that without saying why
 * looks broken (W.27).
 */
export function WorkboardColumnFoot({
  laneId,
  cardCount,
  canAdd,
  manualOrder,
  sectioned = false,
  sort,
  saving,
  quickAdd,
  onAddCard,
}: {
  laneId: string;
  /** What the column holds now, which is how quick-add knows a refresh landed. */
  cardCount: number;
  canAdd: boolean;
  manualOrder: boolean;
  /** This column is drawing its cards in groups of its own (W.94), so its own rank no longer matches the order on screen. */
  sectioned?: boolean;
  sort: SortId;
  saving: boolean;
  /**
   * Type a title here and the card is made in this column (W.92.8). Undefined
   * across boards, where a lane names no single board to put a card on;
   * there the foot keeps the button that opens the drawer, which asks.
   */
  quickAdd?: QuickAdd;
  onAddCard: (laneId: string, title?: string) => void;
}) {
  return (
    <>
      {(!manualOrder || sectioned) && (
        <p className="admin-kanban-sorted">
          {/* Three reasons a column cannot be reordered by hand, and they
              read differently because a person who dragged a card and saw it
              spring back deserves to know which one stopped it (W.27, W.94). */}
          {sectioned
            ? "In groups — drag to reorder is off"
            : sort === "manual"
              ? "Grouped — drag to reorder is off"
              : `Sorted by ${SORT_SHORT[sort].toLowerCase()} — drag to reorder is off`}
        </p>
      )}
      {canAdd &&
        (quickAdd ? (
          <WorkboardQuickAdd laneId={laneId} cardCount={cardCount} saving={saving} quickAdd={quickAdd} onOpenDrawer={onAddCard} />
        ) : (
          <button className="admin-kanban-add" onClick={() => onAddCard(laneId)}>
            + Add a card
          </button>
        ))}
    </>
  );
}
