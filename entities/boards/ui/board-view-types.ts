import type { WorkboardCard } from "@/entities/boards/lib/workboard";
import type { TaskPriority } from "@/entities/boards/lib/types";

// The card as the workboard places it (an optimistic lane override layered on
// the server's laneId), the card form, and the two callback shapes the board
// hands its drawers. Split out of BoardView.tsx (Q3, 2026-09-05); lane-based
// since WB-01, when one Workboard began serving every surface.

export type Card = WorkboardCard & { columnId: string };

// The client picker's value for a board with no client; "" means not chosen yet.
export const INTERNAL = "internal";

export type Form = {
  id: string | null; // null = create
  // The board the card is on (or, for a new card on a many-board scope, the
  // one chosen in the drawer) and the client that picked it (INTERNAL = none,
  // "" = not chosen yet).
  boardId: string;
  clientId: string;
  // The lane the card sits in; the board's laneColumn map turns it into a column.
  laneId: string;
  title: string;
  priority: TaskPriority;
  assigneeId: string;
  // The assignee the card was opened with, so the drawer can tell a handover
  // from a card that merely has an assignee already (W.60).
  origAssigneeId: string;
  // One line of context for the person being handed the card ("" = none).
  handoverNote: string;
  dueDate: string;
  humanTokens: string; // "" = not estimated
  // The figure the card was opened with, so Save sends the estimate only when
  // the person edited it; the server may have re-derived it since (W.130).
  origHumanTokens: string;
  description: string;
  prUrl: string; // related PR URL ("" = none)
  buildSummary: string; // short summary of the PR/build ("" = none)
  sprintId: string; // "" = no sprint
  origSprintId: string;
  epicId: string; // "" = no epic
  origEpicId: string;
  subjectType: string | null; // commitment cards are not roadmap-linkable
  subjectLabel: string | null;
  roadmapItemId: string; // "" = none
  origRoadmapItemId: string;
  internal: boolean;
  origInternal: boolean;
};

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Runs one server action for a drawer: clears the board banner, runs `fn`
 * inside the board's transition, shows the error on failure, and on success
 * runs `onOk` then refreshes the route so the server's truth shows through.
 *
 * `onFail` runs when the server refuses or never answers (W.141). A control
 * that showed its answer before the server gave one — a ticked box, a ghost
 * row, a typed figure — uses it to put the screen back, because no refresh
 * follows a refusal to do it for them.
 */
export type RunAction = (fn: () => Promise<ActionResult>, onOk?: () => void, onFail?: () => void) => void;
