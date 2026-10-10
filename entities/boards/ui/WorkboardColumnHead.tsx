"use client";

import type { KanbanColumn } from "@/kernel/ui/KanbanBoard";

/**
 * The Workboard's column header: the dot, the label, the count — with W.31's
 * work-in-progress figure folded into that count — and the chevron that folds
 * the column away (W.92.4).
 *
 * It is drawn here rather than in kernel/ui/KanbanBoard.tsx so the eight other
 * boards that render that component keep exactly the header they have. The
 * Workboard now asks for its own head on EVERY column rather than only the
 * limited ones, because the chevron belongs to every column; the kernel's
 * default head is untouched and is still what those eight boards get.
 *
 * ONE LINE, and that is the point of W.92.4. The count and the limit used to
 * be the only things here and they still read as one figure — "7 / 5", amber
 * over the cap — rather than as two, so adding the chevron costs the header no
 * second row and no wrap.
 *
 * INFORMATION, NEVER A BLOCK. Nothing on this path can refuse a drop — the
 * drag handlers do not consult the limit and neither does the server — and
 * `title` says so, because a warning that looks like a wall teaches people to
 * work around the board instead of talking about the work. Folding a column
 * does not block one either: the strip it becomes is still a drop target.
 */
export function WorkboardColumnHead({
  column,
  count,
  limit,
  collapsed,
  window: windowNote,
  showAllLabel = "All done →",
  onShowAll,
  onToggle,
}: {
  column: KanbanColumn;
  count: number;
  /** The cards this column aims to hold at once (W.31); undefined when it claims none. */
  limit: number | undefined;
  collapsed: boolean;
  /**
   * What this column is showing, when it is not showing everything (W.94) —
   * "this sprint" on Done. Undefined on every column that draws every card
   * it has, which is all of them but one.
   */
  window?: string;
  /** The way-to-the-rest link's words; Done's unless the lane says otherwise (W.139). */
  showAllLabel?: string;
  /** Where the rest of this column's cards are; present only with a `window`. */
  onShowAll?: () => void;
  onToggle: () => void;
}) {
  const over = limit !== undefined && count > limit;
  return (
    <>
      {/* The label IS the badge (W.107): a filled chip in the lane's accent,
          which the column already carries as --kanban-accent, so no colour is
          set here. The dot it replaces said "this lane has an accent" beside a
          rail that said the same three pixels above; now the one carrier is
          the word itself, and the rail is gone (admin.css, W.107). */}
      <span className="admin-kanban-col-label wb-col-badge">{column.label}</span>
      {/* A column that is not showing everything SAYS SO, in the head, in
          words, with the way to the rest beside it (W.94). The count next to
          it is what is on screen and nothing else: a head that reported a
          total the board had not drawn is what made "Show 457 older" name
          457 cards that were not behind it. */}
      {windowNote && <span className="admin-kanban-col-window">· {windowNote}</span>}
      <span
        className={`admin-kanban-col-count${limit === undefined ? "" : " wb-col-count--limited"}${over ? " is-over-limit" : ""}`}
        title={
          limit === undefined
            ? undefined
            : over
              ? `${count} cards, and this column aims for ${limit} at a time. Nothing is blocked — it is worth asking what can finish first.`
              : `${count} of a ${limit}-card limit.`
        }
      >
        {limit === undefined ? count : `${count} / ${limit}`}
      </span>
      {windowNote && onShowAll && (
        <button
          type="button"
          className="wb-col-all"
          title="Every card in this lane, in the List view"
          onClick={(e) => {
            e.stopPropagation();
            onShowAll();
          }}
        >
          {showAllLabel}
        </button>
      )}
      {/* The fold. A real button with a real name, because the chevron alone
          says nothing to a screen reader and nothing to anyone who has not
          used the board before; `aria-expanded` is what makes the state
          readable rather than only visible. The click stops here so folding a
          column is not also a click on whatever the column is inside. */}
      <button
        type="button"
        className="wb-col-fold"
        aria-expanded={!collapsed}
        aria-label={collapsed ? `Expand ${column.label}` : `Collapse ${column.label}`}
        title={collapsed ? `Expand ${column.label}` : `Collapse ${column.label}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <span aria-hidden>{collapsed ? "›" : "‹"}</span>
      </button>
    </>
  );
}
