"use client";

import type { BoardPerson } from "@/entities/boards/lib/data";
import type { WorkboardData, WorkboardBoard } from "@/entities/boards/lib/workboard";
import type { RunAction } from "./board-view-types";
import type { WorkboardFilters } from "./useWorkboardFilters";
import { SprintsDrawer } from "./SprintsDrawer";
import { BoardSettingsDrawer } from "./BoardSettingsDrawer";
import { ArchivedCardsDrawer } from "./ArchivedCardsDrawer";

export type BoardDrawer = "sprints" | "archived" | "settings" | null;

// The board page's three drawers (sprints, archived cards, settings),
// wired to one board. They only exist when a single board is in scope; the
// Workboard mounts this once it knows that (WB-01).
export function BoardDrawers({
  open,
  onClose,
  board,
  boardBase,
  data,
  f,
  saving,
  run,
  onError,
  teamOptions,
  clientOptions,
  programOptions,
}: {
  open: BoardDrawer;
  onClose: () => void;
  /** The one board these drawers belong to; null across boards, and then there are none. */
  board: WorkboardBoard | null;
  // Where this board's pages live (/admin or /team), for the sprint links.
  boardBase: string;
  data: WorkboardData;
  f: WorkboardFilters;
  saving: boolean;
  run: RunAction;
  onError: (message: string | null) => void;
  teamOptions: BoardPerson[];
  clientOptions: { id: string; name: string }[];
  programOptions: { id: string; name: string; company_id: string }[];
}) {
  // A sprint, an archive and a board's settings all belong to ONE board, so
  // across boards there is nothing here to open. The condition lives with the
  // drawers rather than at every mount of them.
  if (!board) return null;
  const slug = board.slug;
  // Live cards per sprint; the action itself counts archived ones too before
  // it deletes, so this only decides whether to offer the button.
  const cardCounts = new Map<string, number>();
  for (const c of data.cards) if (c.sprint_id) cardCounts.set(c.sprint_id, (cardCounts.get(c.sprint_id) ?? 0) + 1);
  return (
    <>
      <SprintsDrawer
        open={open === "sprints"}
        onClose={onClose}
        boardId={board.id}
        slug={slug}
        boardBase={boardBase}
        sprints={data.sprints}
        activeSprints={f.activeSprints}
        cardCounts={cardCounts}
        saving={saving}
        run={run}
        onError={onError}
        onClosed={(sprintId) => {
          if (f.sprintFilter === sprintId) f.setSprintFilter("all");
        }}
      />
      <BoardSettingsDrawer
        open={open === "settings"}
        onClose={onClose}
        board={board}
        columns={board.columns}
        slug={slug}
        members={data.members}
        epics={data.epics.filter((e) => e.status === "active" && e.board_id === board.id)}
        teamOptions={teamOptions}
        clientOptions={clientOptions}
        programOptions={programOptions}
        saving={saving}
        run={run}
      />
      <ArchivedCardsDrawer open={open === "archived"} onClose={onClose} slug={slug} archivedCards={data.archivedCards} saving={saving} run={run} />
    </>
  );
}
