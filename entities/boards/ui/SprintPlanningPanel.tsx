"use client";

import { KanbanBoard, type KanbanColumn } from "@/kernel/ui/KanbanBoard";
import { STAGE_LEAD, STAGE_NEUTRAL, STAGE_WON } from "@/kernel/ui/stageColors";
import { PLANNING_COLUMNS, SEND_TO_BACKLOG, isCarried, isDonePlanningColumn, mayChangeCommitment, type PlanningBoard } from "@/entities/boards/lib/sprint-planning";
import { splitNotDone } from "@/entities/boards/lib/sprint-planning-sections";
import { sprintCommitment } from "@/entities/boards/lib/sprint-commitment";
import type { EpicRow } from "@/entities/boards/lib/types";
import type { WorkboardCard } from "@/entities/boards/lib/workboard";
import { SprintPlanningCard } from "./SprintPlanningCard";
import { SprintPlanningHeading } from "./SprintPlanningHeading";
import { WorkboardQuickAdd } from "./WorkboardQuickAdd";
import { laneLabelSlot } from "./lane-label-slot";

export type PanelCard = WorkboardCard & { columnId: string };

const ACCENT: Record<string, string> = { open: STAGE_NEUTRAL, next: STAGE_LEAD, done: STAGE_WON };

// Three full columns: Not done, Next sprint and Done this week (Dave,
// 2026-09-21, reversing the W.20 strip). Done is a column of its own again so
// the week's finished cards are visible without a click; a card is still
// closed by a drop into it, but never dragged back out (that reopening happens
// in the drawer, isDragDisabled below).
const COLUMNS: KanbanColumn[] = PLANNING_COLUMNS.map((c) => ({ id: c.id, label: c.label, accent: ACCENT[c.id] }));

// One board's planning panel (W.17): the sprint's heading and the board's own
// columns, together. One panel means one DragDropContext per board, so a card
// cannot be dropped into another client's sprint by construction rather than
// by a check after the drop.
//
// Inside Not done the carried cards read first and the backlog follows under
// its own label, nothing folded (W.18, unfolded by W.112); every card carries
// the arrow that commits it without a drag (W.22). A carried card also carries
// an arrow back out, to the backlog, because the Finish sprints routine moves
// whatever is still carried into the next sprint on Wednesday, so not carrying
// a card is a choice someone makes before then (W.207.3). The tick boxes feed
// the page's one selection (W.202.4); the page owns it and the moves.
//
// The meeting also makes and edits the cards it is planning: Not done and Next
// sprint take a new card at their foot (W.112), a click opens a card in the
// Workboard's own drawer, and each card's "…" menu archives what nobody will
// pick up (W.115). The page owns the drawer; the panel only says which card,
// which board, and when.
export function SprintPlanningPanel({
  pb,
  cards,
  sprintName,
  epicById,
  carriedSprints,
  section,
  canEdit,
  today,
  pending,
  move,
  selected,
  picking,
  onPick,
  saving,
  quickAdd,
  openDrawer,
  readBack,
  onOpenCard,
  onArchiveCard,
}: {
  pb: PlanningBoard;
  // This board's cards only, already placed in a planning column.
  cards: PanelCard[];
  sprintName: Map<string, string>;
  epicById: Map<string, EpicRow>;
  // Sprint-commit counts by card id, for the carried-weeks question (W.52).
  carriedSprints: Record<string, number>;
  section: string;
  canEdit: boolean;
  today: string;
  // True while any write from this page is in flight.
  pending: boolean;
  // Moves cards to a planning column; the page says why when it cannot.
  move: (ids: string[], to: string) => void;
  // The page's one selection (W.202.4): what is ticked, whether every box is
  // showing, and a tick, with Shift for the run since the last one.
  selected: ReadonlySet<string>;
  picking: boolean;
  onPick: (id: string, range: boolean, laneIds: string[]) => void;
  // True while a card is being created, for the quick-add's own busy state.
  saving: boolean;
  // Add a card (W.92.8): Enter creates in this board, Shift+Enter opens the drawer.
  quickAdd: (pb: PlanningBoard, column: "open" | "next", title: string, onDone: () => void, onFail: () => void) => void;
  openDrawer: (pb: PlanningBoard, column: "open" | "next", title: string) => void;
  // True while the page reads a past week back: nothing is planned there.
  readBack: boolean;
  onOpenCard: (card: PanelCard) => void;
  onArchiveCard: (card: PanelCard) => void;
}) {
  // The controls that change what is committed are not offered when the board
  // has no open next sprint, nor on a week read back (W.202.3).
  const canCommit = canEdit && !readBack && mayChangeCommitment(pb);
  const canPick = canEdit && !readBack;
  const commitment = sprintCommitment(cards);
  // Each lane's cards in the order it shows them, for a Shift-click run.
  const { carried, backlog } = splitNotDone(cards.filter((c) => c.columnId === "open"), pb, today);
  // Carried cards join the next sprint on Wednesday, which is only true while
  // there is an open next sprint to join and the week is the live one.
  const carriedJoin = carried.length > 0 && canPlanWeek(pb, readBack);
  const laneIds: Record<string, string[]> = {
    open: [...carried, ...backlog].map((c) => c.id),
    next: cards.filter((c) => c.columnId === "next").map((c) => c.id),
  };

  return (
    <div className="admin-card admin-section-card admin-sprint-panel u-mb-3">
      <SprintPlanningHeading pb={pb} section={section} canEdit={canEdit && !readBack} busy={pending} commitment={commitment} />
      <KanbanBoard<PanelCard>
        columns={COLUMNS}
        cards={cards}
        // A drag is a write, Done included: none on a week read back.
        disabled={pending || !canEdit || readBack}
        // Read back (W.202.3) or no open next sprint: neither lane accepts a
        // drop, so nothing a drag can do changes what the week committed to.
        // Done stays open — finishing work is not changing the commitment —
        // which is why this is per column rather than the board-wide disable.
        isDropDisabled={canCommit ? undefined : (col) => !isDonePlanningColumn(col.id)}
        // A done card is not dragged back out (W.20): reopening a card happens
        // in its drawer, where it is a decision rather than a slip of the hand.
        isDragDisabled={(c) => isDonePlanningColumn(c.columnId)}
        onMove={(cardId, to) => move([cardId], to)}
        cardClassName={(c) => (selected.has(c.id) ? "is-selected" : undefined)}
        onCardClick={onOpenCard}
        // Add a card at the foot of Not done or Next sprint, like every other
        // board (W.92.8). Not under Done — a card is finished there, not made —
        // nor under a Next sprint that cannot take a commitment (closed, W.203),
        // nor on a past week read back.
        columnFooter={(col) =>
          canEdit && !readBack && (col.id === "open" || (col.id === "next" && mayChangeCommitment(pb))) ? (
            <WorkboardQuickAdd
              laneId={col.id}
              cardCount={cards.filter((c) => c.columnId === col.id).length}
              saving={saving}
              quickAdd={(_lane, title, onDone, onFail) => quickAdd(pb, col.id as "open" | "next", title, onDone, onFail)}
              onOpenDrawer={(_lane, title) => openDrawer(pb, col.id as "open" | "next", title)}
            />
          ) : null
        }
        emptyLabel={(col) => (isDonePlanningColumn(col.id) ? "Nothing finished yet this week." : "No cards")}
        cardSections={(col, colCards) => {
          // Not done opens with a label (Carried, or Backlog)
          // whenever it has cards, so the other lanes keep a label's space
          // at their top and the first cards line up (W.114); Carried also
          // carries a line of note, which they keep the space of too.
          if (col.id !== "open") return colCards.length > 0 && cards.some((c) => c.columnId === "open") ? laneLabelSlot(col.id, colCards, carriedJoin) : null;
          const { carried, backlog } = splitNotDone(colCards, pb, today);
          return [
            ...(carried.length > 0
              ? [{ key: "carried", heading: sectionLabel("Carried", carried.length), note: carriedJoin ? "These join the next sprint on Wednesday." : undefined, cards: carried }]
              : []),
            ...(backlog.length > 0 ? [{ key: "backlog", heading: sectionLabel("Backlog", backlog.length), cards: backlog }] : []),
          ];
        }}
        renderCard={(c) => (
          <SprintPlanningCard
            card={c}
            board={pb.board}
            epicById={epicById}
            sprintFilter={pb.next?.id ?? ""}
            carriedFrom={isCarried(c, pb) ? (sprintName.get(c.sprint_id ?? "") ?? "a past sprint") : null}
            carriedSprints={carriedSprints[c.id] ?? 0}
            // A finished card carries no box: nothing on the bar applies to it.
            selected={canPick && !isDonePlanningColumn(c.columnId) ? selected.has(c.id) : null}
            picking={picking}
            onToggleSelected={(range) => onPick(c.id, range, laneIds[c.columnId] ?? [])}
            onSendToBacklog={canPick && c.columnId === "open" && isCarried(c, pb) ? () => move([c.id], SEND_TO_BACKLOG) : null}
            onCommit={canCommit && c.columnId === "open" ? () => move([c.id], "next") : null}
            onUncommit={canCommit && c.columnId === "next" ? () => move([c.id], "open") : null}
            onOpen={() => onOpenCard(c)}
            onArchive={canEdit ? () => onArchiveCard(c) : null}
            busy={pending}
          />
        )}
      />
    </div>
  );
}

// Whether the Wednesday routine will carry what is still in the ended sprint
// into this board's sprint: the live week, with a next sprint still open.
function canPlanWeek(pb: PlanningBoard, readBack: boolean): boolean {
  return !readBack && mayChangeCommitment(pb);
}

// A signpost inside the lane, not a control: the label and how many follow.
function sectionLabel(label: string, count: number) {
  return (
    <>
      <span className="admin-kanban-col-section-label">{label}</span>
      <span className="admin-kanban-col-count">{count}</span>
    </>
  );
}
