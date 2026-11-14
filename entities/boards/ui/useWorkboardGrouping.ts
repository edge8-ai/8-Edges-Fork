"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { updateCard } from "@/entities/boards/lib/actions";
import { setCardSprint } from "@/entities/boards/lib/sprint-actions";
import { setCardEpic } from "@/entities/boards/lib/epic-actions";
import type { WorkboardBoard, WorkboardData } from "@/entities/boards/lib/workboard";
import type { KanbanColumn } from "@/kernel/ui/KanbanBoard";
import type { SyncedRun } from "@/kernel/ui/hooks/useServerSyncedState";
import type { Card } from "./board-view-types";
import type { GroupingId, SortId } from "./workboard-filter-params";
import { cardGroupId, groupColumns, groupDropRefusal, type GroupingVocabulary } from "./workboard-grouping";
import { groupDropWrite } from "./workboard-group-drop";
import { manualOrderAllowed, sortCards } from "./workboard-sort";

// Where the board's columns come from and what a drop into one does (W.25,
// W.27). The lanes are still the default and still go through the board's own
// cross-lane move, with its optimistic placement and its "that board has no
// Doing column" refusal; every other grouping writes a field on the card.
//
// The optimistic half is the same idea as the lane placement in Workboard.tsx,
// one layer down: a dropped card jumps to its new column immediately, and the
// override is dropped the moment fresh cards arrive, so a failed write shows
// the server's truth rather than a snapshot nobody can see is stale.
export function useWorkboardGrouping({
  data,
  cards,
  vocabulary,
  groupings,
  grouping,
  sort,
  boardById,
  laneMove,
  laneReorder,
  setBanner,
  run,
}: {
  data: WorkboardData;
  /** The filtered cards, already in the board's own lane order. */
  cards: Card[];
  vocabulary: GroupingVocabulary;
  groupings: GroupingId[];
  grouping: GroupingId;
  sort: SortId;
  boardById: Map<string, WorkboardBoard>;
  laneMove: (cardId: string, laneId: string) => void;
  laneReorder: (cardId: string, laneId: string, toIndex: number) => void;
  setBanner: (message: string | null) => void;
  /** The board's synced write: in flight, settled, rolled back on a refusal. */
  run: SyncedRun;
}) {
  const [override, setOverride] = useState<Record<string, string>>({});
  useEffect(() => setOverride({}), [data.cards]);

  // A grouping this scope cannot offer falls back to the lanes, which every
  // scope has. The codec refuses the same value on the way in; this catches the
  // case where the scope narrows under a grouping already chosen.
  const active: GroupingId = groupings.includes(grouping) ? grouping : "lane";

  // Two lines, as the plan said the read path would be: a card's column is
  // whatever the grouping says it is, and the sort reorders the one array the
  // kanban splits per column.
  const grouped = useMemo(
    () => sortCards(cards.map((c) => ({ ...c, columnId: override[c.id] ?? cardGroupId(c, active, vocabulary) })), sort),
    [cards, active, vocabulary, sort, override],
  );
  const columns: KanbanColumn[] = useMemo(() => groupColumns(active, grouped, vocabulary), [active, grouped, vocabulary]);

  const refusal = groupDropRefusal(active);

  const onMove = useCallback(
    (cardId: string, toColumnId: string) => {
      if (active === "lane") {
        laneMove(cardId, toColumnId);
        return;
      }
      if (refusal) {
        setBanner(refusal);
        return;
      }
      const card = data.cards.find((c) => c.id === cardId);
      const board = card ? boardById.get(card.board_id ?? "") : undefined;
      if (!board) {
        setBanner("That card's board is no longer in view, so the change could not be saved.");
        return;
      }
      const write = groupDropWrite(active, cardId, toColumnId, board.slug, { setEpic: setCardEpic, setSprint: setCardSprint, update: updateCard });
      if (!write) {
        setBanner("That column can't be dropped into.");
        return;
      }
      setOverride((o) => ({ ...o, [cardId]: toColumnId }));
      setBanner(null);
      void run(write, {
        // A refused write says what it refused — "That epic is not on this
        // board" — rather than reverting the card with no explanation.
        onError: (message) => setBanner(`Couldn't move card: ${message}`),
      });
    },
    [active, refusal, laneMove, data.cards, boardById, setBanner, run],
  );

  return {
    grouping: active,
    columns,
    cards: grouped,
    onMove,
    // Manual rank is a position within a LANE, so a sorted or regrouped board
    // hands the kanban no reorder handler at all and every column says why.
    onReorder: manualOrderAllowed(active, sort) ? laneReorder : undefined,
    manualOrder: manualOrderAllowed(active, sort),
  };
}
