"use client";

import { useState } from "react";
import { KanbanBoard, type KanbanColumn } from "@/kernel/ui/KanbanBoard";
import { STAGE_LEAD, STAGE_NEUTRAL, STAGE_WON } from "@/kernel/ui/stageColors";
import { saigonToday } from "@/kernel/config/dates";
import { PLANNING_COLUMNS, dueBeforeSprint, isCarried, type PlanningBoard } from "@/entities/boards/lib/sprint-planning";
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
// the arrows and the checkbox that commit it without a drag (W.22), and a
// locked sprint refuses the gesture outright rather than springing the card
// back (W.19). Committing a card already late for the sprint offers to move
// its date into it (W.112).
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
  pending,
  move,
  saving,
  quickAdd,
  openDrawer,
  canAdd,
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
  // True while any write from this page is in flight.
  pending: boolean;
  // `onLanded` runs once the move has held, never for a refused or failed one.
  move: (cardId: string, to: string, onLanded?: () => void) => void;
  // True while a card is being created, for the quick-add's own busy state.
  saving: boolean;
  // Add a card (W.92.8): Enter creates in this board, Shift+Enter opens the drawer.
  quickAdd: (pb: PlanningBoard, column: "open" | "next", title: string, onDone: () => void, onFail: () => void) => void;
  openDrawer: (pb: PlanningBoard, column: "open" | "next", title: string) => void;
  // False while the page reads a past week back: its sprint may be closed.
  canAdd: boolean;
  onOpenCard: (card: PanelCard) => void;
  onArchiveCard: (card: PanelCard) => void;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // The cards the last commit made late for the sprint; replaced by the next.
  const [late, setLate] = useState<PanelCard[]>([]);

  const locked = !!pb.next?.locked_at;
  // A locked sprint's commitments change only after an explicit Unlock
  // (SW-01), so the controls that change them are not offered at all.
  const canCommit = canEdit && !locked;
  const pickedToCommit = cards.filter((c) => c.columnId === "open" && selected.has(c.id));
  const commitment = sprintCommitment(cards);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  // Every commit — the arrow, the box or a drop — comes through here, so the
  // late-date offer follows each one exactly once. A card joins the offer only
  // when its commit has landed (W.133): a refused or failed commit leaves the
  // card where it was, and offering to move its date would be a second action
  // on a decision that did not happen.
  function commit(ids: string[]) {
    const lateNow = dueBeforeSprint(cards.filter((c) => ids.includes(c.id)), pb.next);
    setLate([]);
    for (const id of ids) {
      const card = lateNow.find((c) => c.id === id);
      move(id, "next", card ? () => setLate((l) => (l.some((x) => x.id === card.id) ? l : [...l, card])) : undefined);
    }
  }

  function commitSelected() {
    commit(pickedToCommit.map((c) => c.id));
    setSelected(new Set());
  }

  return (
    <div className="admin-card admin-section-card admin-sprint-panel u-mb-3">
      <SprintPlanningHeading pb={pb} section={section} canEdit={canEdit} busy={pending} commitment={commitment} />
      {selected.size > 0 && (
        <div className="admin-sprint-panel-bulk">
          <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" disabled={pickedToCommit.length === 0 || pending} onClick={commitSelected}>
            Commit {pickedToCommit.length} selected
          </button>
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}
      {pb.next && late.length > 0 && (
        <SprintPlanningLateOffer cards={late} sprint={pb.next} boardSlug={pb.board.slug} onClose={() => setLate([])} />
      )}
      <KanbanBoard<PanelCard>
        columns={COLUMNS}
        cards={cards}
        disabled={pending || !canEdit}
        // Locked (W.19): neither lane accepts a drop, so nothing a drag can do
        // changes what the week committed to. Done stays open — finishing work
        // is not changing the commitment — which is why this is per column
        // rather than the board-wide disable.
        isDropDisabled={locked ? (col) => col.id !== "done" : undefined}
        // A done card is not dragged back out (W.20): reopening a card happens
        // in its drawer, where it is a decision rather than a slip of the hand.
        isDragDisabled={(c) => c.columnId === "done"}
        columnClassName={locked ? (col) => (col.id === "next" ? "is-locked" : undefined) : undefined}
        onMove={(cardId, to) => (to === "next" ? commit([cardId]) : move(cardId, to))}
        onCardClick={onOpenCard}
        // Add a card at the foot of Not done or Next sprint, like every other
        // board (W.92.8). Not under Done — a card is finished there, not made —
        // nor under a locked Next sprint, which refuses new commitments (W.19),
        // nor on a past week read back.
        columnFooter={(col) =>
          canEdit && canAdd && (col.id === "open" || (col.id === "next" && !locked)) ? (
            <WorkboardQuickAdd
              laneId={col.id}
              cardCount={cards.filter((c) => c.columnId === col.id).length}
              saving={saving}
              quickAdd={(_lane, title, onDone, onFail) => quickAdd(pb, col.id as "open" | "next", title, onDone, onFail)}
              onOpenDrawer={(_lane, title) => openDrawer(pb, col.id as "open" | "next", title)}
            />
          ) : null
        }
        emptyLabel={(col) => (col.id === "done" ? "Nothing finished yet this week." : "No cards")}
        cardSections={(col, colCards) => {
          // Not done opens with a label (Carried, or Backlog)
          // whenever it has cards, so the other lanes keep a label's space
          // at their top and the first cards line up (W.114).
          if (col.id !== "open") return colCards.length > 0 && cards.some((c) => c.columnId === "open") ? laneLabelSlot(col.id, colCards) : null;
          const { carried, backlog } = splitNotDone(colCards, pb, saigonToday());
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
            // The box feeds "Commit selected", which only commits from Not
            // done, so a card already committed or finished carries no box.
            selected={canCommit && c.columnId === "open" ? selected.has(c.id) : null}
            onToggleSelected={() => toggle(c.id)}
            onCommit={canCommit && c.columnId === "open" ? () => commit([c.id]) : null}
            onUncommit={canCommit && c.columnId === "next" ? () => move(c.id, "open") : null}
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
