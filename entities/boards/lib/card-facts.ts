import { AGING_DAYS, daysInColumn } from "./types";

// What a card shows, decided once (A.29.1).
//
// Every surface that draws a card used to work its facts out for itself:
// overdue was written six times, "client or Internal" seven, and the copies
// had started to disagree — the Flow view counted a card due today as overdue
// from 07:00 Saigon while the card itself showed it on time. The card, the
// list row, the calendar day, the My Week row and the drawer now read their
// facts here, and the three places that COUNT cards (the Flow view, the
// morning digest, My Week's grouping) ask `isOverdue` directly.
//
// Facts, not presentation: this returns booleans, numbers and words, never a
// class name. Each surface keeps its own styling — `is-high` on the board,
// `is-lead` on My Week — for the same fact.
//
// Server- and browser-safe on purpose (no server code), so the UI imports it
// the way it imports lib/tokens. Human Tokens are not here: the estimate has
// a module of its own (A.29.2). The terms Business date, Overdue and Internal
// board are defined in CONTEXT.md.

/** The fields a card's facts are read from. Its status is the lane's (laneStatus), as every loader returns it. */
export type FactCard = {
  status: string;
  due_date: string | null;
  priority: string;
  assignee_id: string | null;
  blockers: { resolved: boolean }[];
  subtasks: { done: boolean }[];
  last_moved_at: string | null;
};

/** The board a card sits on, as far as its labels need it. */
export type FactBoard = { name: string; client_name: string | null };

export type CardFacts = {
  overdue: boolean;
  /** Whose work it is: the client, or "Internal" for an internal board. */
  clientLabel: string;
  /** Where the card lives, for a list that spans boards: "Client · Board". */
  placeLabel: string;
  highPriority: boolean;
  /** The viewer holds this card. */
  mine: boolean;
  openBlockers: number;
  subtasks: { done: number; total: number };
  /** How long the card has sat in its column, and whether that is long enough to say so. */
  aging: { days: number; aging: boolean };
};

/**
 * Overdue: still open, with a due date strictly before today's BUSINESS date
 * (the Saigon calendar date), counted in calendar days. A card due today is
 * not overdue until tomorrow; a card due on a Saturday is overdue from the
 * Sunday. `today` is a YYYY-MM-DD string, never a Date: a Date compared with a
 * date-only string is UTC midnight, which is how the Flow view got it wrong.
 */
export function isOverdue(card: { status: string; due_date: string | null }, today: string): boolean {
  if (card.status !== "open" || !card.due_date) return false;
  // A due date may arrive as a timestamp; the date is its first ten characters.
  return card.due_date.slice(0, 10) < today;
}

/**
 * Whose work a board holds. "Internal" means an INTERNAL BOARD — one that
 * belongs to no client — and not an internal card, which is a card the client
 * never sees and can sit on a client's board (CONTEXT.md keeps the two apart).
 * A card whose board is not in view reads "Internal", as it always has.
 */
export function clientLabel(board: { client_name: string | null } | undefined): string {
  return board?.client_name ?? "Internal";
}

/**
 * Where a card lives, for a list that spans boards (My Week): the client and
 * the board, or the board alone when it belongs to no client or is named after
 * its client. A different question from clientLabel, so a different fact.
 */
export function placeLabel(board: FactBoard | undefined): string {
  if (!board) return "";
  const client = board.client_name;
  return client && client !== board.name ? `${client} · ${board.name}` : board.name;
}

/** Blockers not yet resolved. The Attention filter's "Blocked" asks it too. */
export function countOpenBlockers(card: { blockers: { resolved: boolean }[] }): number {
  return card.blockers.filter((b) => !b.resolved).length;
}

/**
 * The `done/total` a card shows for its subtasks. A subtask set aside in Not
 * Doing is in neither figure (W.139): counting it as not done read "0/2" on a
 * card whose two subtasks nobody owed, for as long as the card existed.
 */
export function subtaskProgress(subtasks: { done: boolean; setAside?: boolean }[]): { done: number; total: number } {
  const owed = subtasks.filter((s) => !s.setAside);
  return { done: owed.filter((s) => s.done).length, total: owed.length };
}

export function cardFacts(
  card: FactCard,
  ctx: {
    /** Today's business date, YYYY-MM-DD. */
    today: string;
    viewerPersonId?: string | null;
    board?: FactBoard;
    /** The clock aging is measured against; the real one unless a test pins it. */
    now?: Date;
  },
): CardFacts {
  const days = daysInColumn(card.last_moved_at, ctx.now);
  return {
    overdue: isOverdue(card, ctx.today),
    clientLabel: clientLabel(ctx.board),
    placeLabel: placeLabel(ctx.board),
    highPriority: card.priority === "p1",
    mine: !!ctx.viewerPersonId && card.assignee_id === ctx.viewerPersonId,
    openBlockers: countOpenBlockers(card),
    subtasks: subtaskProgress(card.subtasks),
    aging: { days, aging: days >= AGING_DAYS && card.status === "open" },
  };
}
