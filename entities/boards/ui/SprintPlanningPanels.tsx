"use client";

import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { formatDate } from "@/kernel/ui/format";
import { finishPlanning } from "@/entities/boards/lib/sprint-settings";
import type { EpicRow } from "@/entities/boards/lib/types";
import { commitmentLocked, type PlanningBoard } from "@/entities/boards/lib/sprint-planning";
import { SprintPlanningPanel, type PanelCard } from "./SprintPlanningPanel";

// The planning page's body (W.17, was SprintPlanningNext): one panel per board
// in view, then the one line that speaks for all of them. Each board's sprint,
// its heading and its cards are now the same block, instead of a strip of rows
// above three columns that mixed every client's cards together.
//
// Finish planning closes every sprint that ended and locks every next sprint
// in view (SW-01), which is a decision about the page rather than about one
// board, so it stays below the panels.
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
  // Each board's late-date offer, by board id (W.112).
  late: Record<string, PanelCard[]>;
  onCloseLate: (boardId: string) => void;
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
  const ending = boards.flatMap((b) => b.ending);
  const nexts = boards.flatMap((b) => (b.next ? [b.next] : []));
  // Finish planning locks the sprints with no locked_at; the lock then holds
  // only until each starts (W.202.2), so "locked" here is what holds today.
  const unlocked = nexts.filter((s) => !s.locked_at);
  const finished = nexts.filter((s) => s.locked_at);
  const lockedNow = boards.flatMap((b) => (b.next && commitmentLocked(b, today) ? [b.next] : []));
  const finishedAt = finished.map((s) => s.locked_at!).sort().at(-1) ?? null;
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
          late={late[pb.board.id] ?? []}
          onCloseLate={() => onCloseLate(pb.board.id)}
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
      {/* A week read back is history: nothing is finished or locked there (W.202.3). */}
      {nexts.length > 0 && !readBack && (
        <div className="u-row u-mt-3">
          <span className="admin-cell-muted u-sm u-grow">
            {finishedAt && unlocked.length === 0
              ? `Planning finished ${formatDate(finishedAt)}.` +
                (lockedNow.length > 0 ? ` ${lockedNow.length} ${lockedNow.length === 1 ? "sprint is" : "sprints are"} locked until ${lockedNow.length === 1 ? "it starts" : "they start"}. Unlock one to change it.` : "")
              : [
                  ending.length > 0 ? `${ending.length} earlier ${ending.length === 1 ? "sprint is" : "sprints are"} still open.` : null,
                  `${unlocked.length} of ${nexts.length} next ${nexts.length === 1 ? "sprint is" : "sprints are"} not locked yet. Anything left in Not done stays in the backlog.`,
                ]
                  .filter(Boolean)
                  .join(" ")}
          </span>
          {canEdit && unlocked.length > 0 && (
            <ConfirmButton
              label="Finish planning"
              className="admin-btn admin-btn--primary admin-btn--sm"
              title="Finish planning?"
              body={
                <>
                  Locks {unlocked.map((s) => s.name).join(", ")}
                  {ending.length > 0 ? <> and closes {ending.map((s) => s.name).join(", ")}</> : null}. Cards you did not move stay in Not done.
                </>
              }
              confirmLabel="Finish planning"
              disabled={pending}
              onConfirm={() => finishPlanning(ending.map((s) => s.id), unlocked.map((s) => s.id))}
            />
          )}
        </div>
      )}
    </>
  );
}
