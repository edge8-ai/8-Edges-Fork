"use client";

import type { EpicRow } from "@/entities/boards/lib/types";
import type { PlanningBoard } from "@/entities/boards/lib/sprint-planning";
import { SprintPlanningPanel, type PanelCard } from "./SprintPlanningPanel";

// The planning page's body (W.17, was SprintPlanningNext): one panel per board
// in view. Each board's sprint, its heading and its cards are the same block,
// instead of a strip of rows above three columns that mixed every client's
// cards together. Nothing speaks for all of them: the Finish sprints routine
// closes the ended sprints on Wednesday (W.207), so the page has no
// Finish planning step of its own.
export function SprintPlanningPanels({
  boards,
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
  boards: PlanningBoard[];
  cards: PanelCard[];
  sprintName: Map<string, string>;
  epicById: Map<string, EpicRow>;
  carriedSprints: Record<string, number>;
  section: string;
  canEdit: boolean;
  today: string;
  pending: boolean;
  move: (ids: string[], to: string) => void;
  selected: ReadonlySet<string>;
  picking: boolean;
  onPick: (id: string, range: boolean, laneIds: string[]) => void;
  // True while a card is being created. Adding a card (W.92.8): a foot at the
  // bottom of a panel's Not done / Next sprint column, Shift+Enter to the drawer.
  saving: boolean;
  quickAdd: (pb: PlanningBoard, column: "open" | "next", title: string, onDone: () => void, onFail: () => void) => void;
  openDrawer: (pb: PlanningBoard, column: "open" | "next", title: string) => void;
  // True while a past week is read back: nothing is planned there (W.202.3).
  readBack: boolean;
  onOpenCard: (card: PanelCard) => void;
  onArchiveCard: (card: PanelCard) => void;
}) {
  return (
    <>
      {boards.length === 0 && (
        <div className="admin-card admin-section-card u-mb-3">
          <p className="admin-page-sub u-m-0">No board runs weekly sprints for this team yet. Switch it on in Board settings.</p>
        </div>
      )}
      {boards.map((pb) => (
        <SprintPlanningPanel
          key={pb.board.id}
          pb={pb}
          cards={cards.filter((c) => c.board_id === pb.board.id)}
          sprintName={sprintName}
          epicById={epicById}
          carriedSprints={carriedSprints}
          section={section}
          canEdit={canEdit}
          today={today}
          pending={pending}
          move={move}
          selected={selected}
          picking={picking}
          onPick={onPick}
          saving={saving}
          quickAdd={quickAdd}
          openDrawer={openDrawer}
          readBack={readBack}
          onOpenCard={onOpenCard}
          onArchiveCard={onArchiveCard}
        />
      ))}
    </>
  );
}
