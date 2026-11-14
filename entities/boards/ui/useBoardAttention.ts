"use client";

import { useMemo } from "react";
import { saigonToday } from "@/kernel/config/dates";
import {
  activeSprintIds,
  doneWindowNote,
  doneWindowStart,
  type DoneScope,
} from "@/entities/boards/lib/workboard-columns-window";
import type { WorkboardData } from "@/entities/boards/lib/workboard";
import type { Card } from "./board-view-types";
import { useBoardSelection, type BoardSelection } from "./useBoardSelection";
import { useWorkboardChanges, type WorkboardChanges } from "./useWorkboardChanges";

// What the board is drawing attention to, and what the reader has picked.
//
// Three questions the board asks itself before it renders, gathered here
// because each one is about the READER rather than about the cards, and none
// of them belongs to the filters (which are about the cards) or to the drag
// state (which is about the server):
//
//   · what moved since you last looked (W.63);
//   · what you have ticked, and whether ticking is even offered (W.70);
//   · how far back the Done column reaches, and which sprints are running
//     (W.94) — the two dates the first and last columns are drawn from.
//
// Workboard was the only home they had, and it was already at the size cap
// holding the shell, the filters, the drag and the drawers.

export type BoardAttention = {
  changes: WorkboardChanges;
  selection: BoardSelection;
  /** Whether a selection is offered at all on this surface, in this view. */
  canSelect: boolean;
  /**
   * The first day a finished card is still drawn on the board (W.94), or null
   * when the board must draw every one of them.
   */
  doneWindowStart: string | null;
  /**
   * What the Done head says it is showing — "today & yesterday" across many
   * boards, "this sprint" on one, or "last 7 days" on a board with no sprint
   * running. Null when nothing is being left off, because a head that
   * qualifies a column it is drawing in full is a lie in the other direction.
   */
  doneWindowLabel: string | null;
  /**
   * Whether the Done lane draws its day groups (W.103.7): only where the
   * window is two days long and is actually narrowing the lane. A single
   * board's Done is one sprint in one list, as it has always been.
   */
  doneGrouped: boolean;
  /** The active sprints that have started: what "committed" means today. */
  activeSprintIds: ReadonlySet<string>;
  /** Today, in the business timezone, so every column reads the same date. */
  today: string;
};

export function useBoardAttention({
  data,
  cards,
  filtersActive,
  canEdit,
  view,
  singleBoard,
}: {
  data: WorkboardData;
  /** The cards the filters are drawing. */
  cards: Card[];
  filtersActive: boolean;
  canEdit: boolean;
  view: "board" | "list";
  /**
   * Whether this page is one board's Workboard rather than the company's or a
   * member's. It is the only input to how far back Done reaches (W.103.7).
   */
  singleBoard: boolean;
}): BoardAttention {
  const changes = useWorkboardChanges(data.cards);
  const selection = useBoardSelection(cards.map((c) => c.id));
  const scope: DoneScope = singleBoard ? "single" : "many";

  return {
    changes,
    selection,
    // Only where the viewer can edit, and only on the board: there is nothing
    // to do with a selection on a read-only surface, and the List view has
    // its own per-row controls rather than a second set of checkboxes.
    canSelect: canEdit && view === "board",
    // A NARROWED BOARD DRAWS EVERYTHING. The reader is looking for
    // something, and a done card their search matched but the window hid is
    // a card the board lost — which is the failure W.94 replaced the fold to
    // avoid, and the same promise W.55 made and could not keep.
    doneWindowStart: useMemo(
      () => (filtersActive ? null : doneWindowStart(data.sprints, saigonToday(), scope)),
      [filtersActive, data.sprints, scope],
    ),
    doneWindowLabel: useMemo(
      () => (filtersActive ? null : doneWindowNote(data.sprints, saigonToday(), scope)),
      [filtersActive, data.sprints, scope],
    ),
    // The groups say which of the two days a card belongs to, so they are
    // only worth drawing where the window is those two days and is actually
    // narrowing the lane. A narrowed board draws every finished card and gets
    // no labels, for the same reason its head carries no note.
    doneGrouped: scope === "many" && !filtersActive,
    activeSprintIds: useMemo(() => activeSprintIds(data.sprints, saigonToday()), [data.sprints]),
    today: saigonToday(),
  };
}
