"use client";

import { useState } from "react";
import { Icon } from "@/kernel/ui/Icon";
import type { BoardSelection } from "./useBoardSelection";
import { GROUPING_LABEL } from "./workboard-grouping";
import { SORT_LABEL } from "./workboard-sort";
import { SORTS, type GroupingId, type SortId } from "./workboard-filter-params";

/**
 * How the board is arranged, behind one button (W.103.5).
 *
 * WHY. The toolbar was two rows and 103px tall — search and seven pickers on
 * the first, then the view switcher, the density pair, Select, an aging legend
 * and two buttons on the second — where ClickUp's equivalent is one row of
 * about 40. On a phone it became four rows and roughly 400px, which is half a
 * viewport before the first card. Two rows of chrome above a board is two rows
 * of the board you cannot see.
 *
 * WHAT IS IN HERE AND WHAT IS NOT. Group by and Sort are things you set once
 * and live with for a session; Select is reached a few times a day. Neither is
 * read at a glance, and both were taking permanent width from a row whose job
 * is to get you to a card. What stays in the row is what you either read or
 * reach for constantly: the search, the filters, the view you are in, and New.
 *
 * The density pair was here too and is gone (W.103.13, Khoa: "that compact
 * thing is completely useless"). It had stopped earning its place on its own
 * terms as well — it bought 14% of a card's height by tightening whitespace,
 * and after W.103.12 the whitespace is the point.
 *
 * NOT A `role="menu"`. This holds two selects, and a menu whose items are form
 * controls is a menu in name only — the roles would claim the arrow keys the
 * controls want for their own values. It is a labelled group in a popover,
 * with the same box, backdrop and dismissal as the board's other menus
 * (admin-consistency-playbook.md), and each control keeps the semantics it
 * already had.
 */
export function WorkboardViewMenu({
  showGrouping,
  groupings,
  group,
  onGroup,
  showSort,
  sort,
  onSort,
  selection,
}: {
  showGrouping: boolean;
  groupings: GroupingId[];
  group: GroupingId;
  onGroup: (next: GroupingId) => void;
  showSort: boolean;
  sort: SortId;
  onSort: (next: SortId) => void;
  /** The board's selection (W.70), or null where ticking is not offered. */
  selection: BoardSelection | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="admin-record-menu-wrap">
      <button
        type="button"
        className="admin-btn admin-btn--sm"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="View options: grouping, sort, selection"
        title="Grouping, sort, selection"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="sliders" />
      </button>
      {open && (
        <>
          <div className="admin-record-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="admin-record-menu wb-viewmenu" aria-label="View options">
            {showGrouping && groupings.length > 1 && (
              <label className="wb-viewmenu-field">
                <span className="admin-label">Group by</span>
                <select className="admin-select" value={group} onChange={(e) => onGroup(e.target.value as GroupingId)}>
                  {groupings.map((g) => (
                    <option key={g} value={g}>
                      {GROUPING_LABEL[g]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {showSort && (
              <label className="wb-viewmenu-field">
                <span className="admin-label">Sort by</span>
                <select className="admin-select" value={sort} onChange={(e) => onSort(e.target.value as SortId)}>
                  {SORTS.map((s) => (
                    <option key={s} value={s}>
                      {SORT_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {/* Show the tick boxes and keep them shown (W.93). It is pressed,
                not discovered: the pointer and the keyboard reveal a card's own
                box without it, and this is for the reader who has neither, or
                who is about to pick ten cards and would rather not hunt for
                each one. It closes the menu, because the next thing that
                happens is on the board. */}
            {selection && (
              <button
                type="button"
                className={`admin-btn admin-btn--sm wb-viewmenu-action${selection.picking ? " is-active" : ""}`}
                aria-pressed={selection.picking}
                onClick={() => {
                  if (selection.picking) selection.clear();
                  else selection.togglePicking();
                  setOpen(false);
                }}
              >
                {selection.picking ? "Stop selecting" : "Select cards"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
