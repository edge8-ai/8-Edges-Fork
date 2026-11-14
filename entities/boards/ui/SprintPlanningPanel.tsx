"use client";

import { KanbanBoard, type KanbanColumn } from "@/kernel/ui/KanbanBoard";
import { STAGE_LEAD, STAGE_NEUTRAL, STAGE_WON } from "@/kernel/ui/stageColors";
import { PLANNING_COLUMNS, commitmentLocked, isCarried, isDonePlanningColumn, mayChangeCommitment, type PlanningBoard } from "@/entities/boards/lib/sprint-planning";
import { splitNotDone } from "@/entities/boards/lib/sprint-planning-sections";
import { sprintCommitment } from "@/entities/boards/lib/sprint-commitment";
import type { EpicRow } from "@/entities/boards/lib/types";
import type { WorkboardCard } from "@/entities/boards/lib/workboard";
import { SprintPlanningCard } from "./SprintPlanningCard";
import { SprintPlanningHeading } from "./SprintPlanningHeading";
import { SprintPlanningLateOffer } from "./SprintPlanningLateOffer";
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
// the arrow that commits it without a drag (W.22), and a locked sprint refuses
// the gesture outright rather than springing the card back (W.19), for as long
// as the lock holds (W.202.2). Committing a card already late for the sprint
// offers to move its date into it (W.112). The tick boxes feed the page's one
// selection (W.202.4); the page owns it, the moves and the late offers.
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
  late,
  onCloseLate,
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
  // The cards this board's last commit made late for its sprint (W.112).
  late: PanelCard[];
  onCloseLate: () => void;
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
  // A locked sprint's commitments change only after an explicit Unlock
  // (SW-01), and only while the lock holds (W.202.2), so the controls that
  // change them are not offered then; nor on a week read back (W.202.3).
  const locked = commitmentLocked(pb, today);
  const canCommit = canEdit && !readBack && mayChangeCommitment(pb, today);
  const canPick = canEdit && !readBack;
  const commitment = sprintCommitment(cards);
  // Each lane's cards in the order it shows them, for a Shift-click run.
  const { carried, backlog } = splitNotDone(cards.filter((c) => c.columnId === "open"), pb, today);
  const laneIds: Record<string, string[]> = {
    open: [...carried, ...backlog].map((c) => c.id),
    next: cards.filter((c) => c.columnId === "next").map((c) => c.id),
  };

  return (
    <div className="admin-card admin-section-card admin-sprint-panel u-mb-3">
      <SprintPlanningHeading pb={pb} section={section} canEdit={canEdit && !readBack} busy={pending} commitment={commitment} locked={locked} />
      {pb.next && late.length > 0 && <SprintPlanningLateOffer cards={late} sprint={pb.next} boardSlug={pb.board.slug} onClose={onCloseLate} />}
      <KanbanBoard<PanelCard>
        columns={COLUMNS}
        cards={cards}
        // A drag is a write, Done included: none on a week read back.
        disabled={pending || !canEdit || readBack}
        // Locked (W.19) or read back (W.202.3): neither lane accepts a drop,
        // so nothing a drag can do changes what the week committed to. Done
        // stays open — finishing work is not changing the commitment — which
        // is why this is per column rather than the board-wide disable.
        isDropDisabled={canCommit ? undefined : (col) => !isDonePlanningColumn(col.id)}
        // A done card is not dragged back out (W.20): reopening a card happens
        // in its drawer, where it is a decision rather than a slip of the hand.
        isDragDisabled={(c) => isDonePlanningColumn(c.columnId)}
        columnClassName={locked ? (col) => (col.id === "next" ? "is-locked" : undefined) : undefined}
        onMove={(cardId, to) => move([cardId], to)}
        cardClassName={(c) => (selected.has(c.id) ? "is-selected" : undefined)}
        onCardClick={onOpenCard}
        // Add a card at the foot of Not done or Next sprint, like every other
        // board (W.92.8). Not under Done — a card is finished there, not made —
        // nor under a Next sprint that cannot take a commitment (locked, W.19,
        // or closed, W.203), nor on a past week read back.
        columnFooter={(col) =>
          canEdit && !readBack && (col.id === "open" || (col.id === "next" && mayChangeCommitment(pb, today))) ? (
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
          // at their top and the first cards line up (W.114).
          if (col.id !== "open") return colCards.length > 0 && cards.some((c) => c.columnId === "open") ? laneLabelSlot(col.id, colCards) : null;
          const { carried, backlog } = splitNotDone(colCards, pb, today);
          return [
            ...(carried.length > 0 ? [{ key: "carried", heading: sectionLabel("Carried", carried.length), cards: carried }] : []),
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

// A signpost inside the lane, not a control: the label and how many follow.
function sectionLabel(label: string, count: number) {
  return (
    <>
      <span className="admin-kanban-col-section-label">{label}</span>
      <span className="admin-kanban-col-count">{count}</span>
    </>
  );
}
