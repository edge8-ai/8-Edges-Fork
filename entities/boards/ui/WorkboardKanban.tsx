"use client";

import { KanbanBoard, type KanbanColumn } from "@/kernel/ui/KanbanBoard";
import type { BoardPerson } from "@/entities/boards/lib/data";
import type { EpicRow } from "@/entities/boards/lib/types";
import type { WorkboardBoard } from "@/entities/boards/lib/workboard";
import type { Card } from "./board-view-types";
import type { CardQuickActions } from "./useWorkboardCardActions";
import type { WorkboardMoveState } from "./useWorkboardDrag";
import { workboardCardClasses } from "./workboard-card-classes";
import { WorkboardKanbanCard } from "./WorkboardKanbanCard";
import { WorkboardColumnPicker } from "./WorkboardColumnPicker";
import { usePhoneColumn } from "./usePhoneColumn";
import { useWorkboardColumnSlots } from "./useWorkboardColumnSlots";
import type { BoardAttention } from "./useBoardAttention";
import type { SortId } from "./workboard-filter-params";
import type { QuickAdd } from "./useWorkboardQuickAdd";

// How the board draws itself: every card is the one WorkboardCard (WB-01).
// Split out of Workboard.tsx when W.15's column foot pushed that file past the
// size cap; Workboard keeps the state, the filters and the drawers, and this
// file keeps the picture.
//
// The columns arrive as a prop since W.25, because what they stand for is a
// choice now — the lanes, an epic, a client, a priority, a sprint or a person —
// and the one place that decides it is workboard-grouping.ts.

export function WorkboardKanban({
  columns,
  cards,
  boardById,
  single,
  viewerPersonId,
  sprintFilter,
  sprintName,
  epicById,
  hideInternal,
  hideClient,
  disabled,
  moveState,
  canAdd,
  filtersActive,
  attention,
  doneColumnIds,
  todoColumnId,
  closedColumnIds,
  onShowAllIn,
  sort,
  manualOrder,
  wipLimits,
  collapsedColumns,
  onToggleColumn,
  selectedCardId,
  saving,
  quick,
  quickAdd,
  mayMove,
  onMove,
  onReorder,
  onCardClick,
  onAddCard,
}: {
  columns: KanbanColumn[];
  cards: Card[];
  boardById: Map<string, WorkboardBoard>;
  /** One board in scope; null across boards, which is what the card reads. */
  single: WorkboardBoard | null;
  viewerPersonId: string | null;
  sprintFilter: string;
  sprintName: Map<string, string>;
  epicById: Map<string, EpicRow>;
  /** Every card in scope is internal, so the chip says nothing. */
  hideInternal: boolean;
  /** One client is in view, so naming it on every card says nothing either. */
  hideClient: boolean;
  disabled: boolean;
  /** Which moves are in flight, which failed, which lane just took a card. */
  moveState: WorkboardMoveState;
  /**
   * Show the per-column "Add a card" button. The board passes false under any
   * grouping but the lanes: the button creates a card IN the column, and a
   * create that landed in the "P1" column without setting P1 would be a lie.
   */
  canAdd: boolean;
  /** Some filter is narrowing the board, so an empty column says so (W.47). */
  filtersActive: boolean;
  /**
   * What the board is drawing attention to and what is ticked: the cards that
   * moved since this reader last looked (W.63 — card ids only, never who
   * moved them), the selection (W.70), and the two dates the first and last
   * columns are drawn from (W.94).
   */
  attention: BoardAttention;
  /**
   * Which of the columns on screen are the DONE lane (W.94), so their head
   * can say what window it is showing. Empty under any grouping but the
   * lanes: "this sprint's finished work" is a statement about a done column,
   * and the P1 column is not one.
   */
  doneColumnIds: ReadonlySet<string>;
  /** The TO DO lane, whose cards read in three groups (W.94); null under any grouping but the lanes. */
  todoColumnId: string | null;
  /** Send the reader to every finished card in the List view. */
  /** Done and Not Doing, the lanes drawn by a window (W.139). */
  closedColumnIds: ReadonlySet<string>;
  onShowAllIn: (columnId: string) => void;
  sort: SortId;
  /** Within-column drag writes a rank; false under a sort or a grouping (W.27). */
  manualOrder: boolean;
  /**
   * Column id → the number of cards that column aims to hold (W.31). Empty
   * under any grouping but the lanes, and on a many-board scope, because a
   * limit belongs to one real column on one real board.
   */
  wipLimits: Map<string, number>;
  /**
   * The columns the reader has folded to a strip (W.92.4), straight off the
   * URL codec. Ids that match no column on screen are simply not folded — the
   * codec cannot check a column id against a vocabulary because what the
   * columns are depends on the grouping it is decoding beside it, so this is
   * where a stale `?collapsed=` comes to nothing.
   */
  collapsedColumns: readonly string[];
  onToggleColumn: (columnId: string) => void;
  /** The card the keyboard is on (W.32); null when nothing is selected. */
  selectedCardId: string | null;
  /** A write is in flight, so the column foot's field and the subtask boxes wait for it. */
  saving: boolean;
  /** Assignee and due date, editable on the card itself (W.30); absent when the viewer may not edit. */
  quick?: CardQuickActions;
  /** Type a title at the foot of a column and the card is made there (W.92.8). */
  quickAdd?: QuickAdd;
  mayMove: (card: Card) => boolean;
  onMove: (cardId: string, toColumnId: string, toIndex?: number) => void;
  onReorder?: (cardId: string, columnId: string, toIndex: number) => void;
  onCardClick: (card: Card) => void;
  onAddCard: (laneId: string, title?: string) => void;
}) {
  const changed = attention.changes.changed;
  const selection = attention.canSelect ? attention.selection : null;
  const { activeSprintIds: sprintIds, today } = attention;

  // Which column a phone is showing, and nothing above the tablet
  // breakpoint (W.64); usePhoneColumn.ts says why.
  const [phoneColumnId, setPhoneColumn] = usePhoneColumn(columns);

  // Everything the board says ABOUT ITS COLUMNS — the heads, the feet, the
  // classes, the To do groups and the drops a sectioned column refuses.
  // useWorkboardColumnSlots holds them; this file holds the cards.
  const col = useWorkboardColumnSlots({
    columns,
    cards,
    moveState,
    collapsedColumns,
    phoneColumnId,
    doneColumnIds,
    todoColumnId,
    doneWindowLabel: attention.doneWindowLabel,
    doneGrouped: attention.doneGrouped,
    sprintIds,
    today,
    wipLimits,
    manualOrder,
    sort,
    canAdd,
    filtersActive,
    saving,
    quickAdd,
    onReorder,
    onToggleColumn,
    closedColumnIds,
    onShowAllIn,
    onAddCard,
  });

  return (
    <>
      <WorkboardColumnPicker
        columns={columns}
        activeId={phoneColumnId}
        // The picker shows the board's own counts, held still with them while a
        // move is being written (W.49), so a tab and its column never disagree.
        countFor={(id) => col.countFor(id, cards.filter((c) => c.columnId === id).length)}
        onSelect={setPhoneColumn}
      />
      <KanbanBoard<Card>
        columns={columns}
        cards={cards}
        // This board's own class: the drag tilt, the landing pop and the pending
        // card all hang off it, so the eight other boards that render KanbanBoard
        // are untouched (W.16).
        boardClassName="wb-board"
        columnCount={col.columnCount}
        renderColumnHead={col.renderColumnHead}
        // A card the keyboard can move (W.65): the announcement names the
        // column it reached, which is the only feedback a person who cannot
        // see the drag gets.
        announceMove={(cardId, toColumnId, sameColumn) => {
          const title = cards.find((c) => c.id === cardId)?.title ?? "Card";
          const label = columns.find((c) => c.id === toColumnId)?.label ?? toColumnId;
          return sameColumn ? `${title} reordered in ${label}.` : `${title} moved to ${label}.`;
        }}
        cardLabel={(c) => c.title}
        columnClassName={col.columnClassName}
        disabled={disabled}
        isDragDisabled={(c) => !mayMove(c)}
        onMove={onMove}
        onReorder={col.onReorder}
        onCardClick={onCardClick}
        emptyLabel={col.emptyLabel}
        cardSections={col.cardSections}
        columnFooter={col.columnFooter}
        // Six states that compose; workboard-card-classes.ts says what each
        // means and why the keyboard's cursor is not "selected".
        cardClassName={(c) => workboardCardClasses(c, { viewerPersonId, moveState, changed, selection, cursorCardId: selectedCardId })}
        renderCard={(c) => (
          <WorkboardKanbanCard
            card={c}
            board={boardById.get(c.board_id ?? "")}
            showBoard={!single}
            viewerPersonId={viewerPersonId}
            sprintFilter={sprintFilter}
            sprintName={sprintName}
            epicById={epicById}
            hideInternal={hideInternal}
            hideClient={hideClient}
            quick={quick}
            selection={selection}
            moveState={moveState}
          />
        )}
      />
    </>
  );
}
