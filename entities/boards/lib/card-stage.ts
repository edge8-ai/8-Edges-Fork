import type { TaskStatus } from "./types";

// A card's stage, asked in one vocabulary (A.42).
//
// A card is open, done, or set aside (Not Doing, 2026-09-24). The database
// stores that as `tasks.status`, and every write keeps storing it. Before this
// module the question "is this card still work?" was asked three ways: about
// sixty sites compared the stored string, two functions in two files held the
// column rule (one for writers, one for readers), and the planning page tested
// a lane id of its own. Adding Not Doing was a 28-file sweep for that reason.
// Every reader now asks here, and an ESLint rail (eslint.config.mjs, A.42)
// refuses a bare comparison anywhere else in the entity, so the next stage is
// a change to this file rather than another sweep.
//
// Server- and browser-safe on purpose (no server code): the board's UI asks the
// same questions the loaders and crons do.

/** The two flags a column carries that decide a card's stage. */
export type ColumnFlags = { is_done: boolean; is_not_doing?: boolean | null };

/** Anything that carries a stored or lane status: a task row, a card, a child. A status not known is no stage. */
type Staged = { readonly status?: string | null };

/**
 * The stored values, for a server read that filters on the stage:
 * `.eq("status", OPEN_STATUS)` names the question where the literal named a
 * string. Writes may use them too; the database's own vocabulary is unchanged.
 */
export const OPEN_STATUS = "open" satisfies TaskStatus;
export const DONE_STATUS = "done" satisfies TaskStatus;
export const SET_ASIDE_STATUS = "not_doing" satisfies TaskStatus;
/** Both closed stages as a PostgREST list: `.not("status", "in", CLOSED_STATUS_LIST)`. */
export const CLOSED_STATUS_LIST = `(${DONE_STATUS},${SET_ASIDE_STATUS})`;

/** The status a card takes in a column: the one rule every write follows. */
export function stageOfColumn(column: ColumnFlags): TaskStatus {
  if (column.is_done) return DONE_STATUS;
  return column.is_not_doing ? SET_ASIDE_STATUS : OPEN_STATUS;
}

/**
 * A card's status as the board shows it: done when it sits in a done lane,
 * set aside in a Not Doing lane, whatever the stored status says (W.111).
 *
 * Every write the app makes sets `status` from the target column
 * (stageOfColumn above, through actions.ts and land-card.ts), so the two only
 * disagree when a row is written from outside the app — a hand-run SQL update
 * that moved the column and not the status. One such card sat in Done with
 * status "open" from 2026-09-21, and the Calendar and My Week, which read
 * status, listed it as overdue with a Done badge beside it. The lane is what
 * every reader of the board sees, so the lane wins here, once, and every
 * surface downstream agrees with it. The other direction is left alone: a
 * card marked done in an open lane is a card somebody finished and has not
 * moved yet, which the board already shows.
 */
export function laneStage<S extends string>(status: S, column: ColumnFlags | null | undefined): S | "done" | "not_doing" {
  if (column?.is_done) return DONE_STATUS;
  return column?.is_not_doing ? SET_ASIDE_STATUS : status;
}

/** Still work: neither finished nor set aside. */
export function isOpen(card: Staged): boolean {
  return card.status === OPEN_STATUS;
}

/** Finished. */
export function isDone(card: Staged): boolean {
  return card.status === DONE_STATUS;
}

/** Closed without being finished (Not Doing). */
export function isSetAside(card: Staged): boolean {
  return card.status === SET_ASIDE_STATUS;
}

/**
 * Off the board's work, either way: done or set aside. Not quite `!isOpen`
 * for a loose string, so a site that asked "neither done nor Not Doing"
 * keeps asking exactly that.
 */
export function isClosed(card: Staged): boolean {
  return isDone(card) || isSetAside(card);
}

/**
 * The board index's two numbers per board: its open work and its finished
 * work, each row counted in its lane's stage (laneStage), which is how the
 * Workboard places the same row. A set-aside card is in neither count.
 *
 * The index used to count the stored status while the Workboard read the
 * lane, so a card moved into Done by a hand-run update counted as open on
 * the index and as done on the board it opened.
 */
export function stageCountsByBoard(
  rows: Iterable<{ board_id: string; status: string; column: ColumnFlags | null | undefined }>,
): Map<string, { open: number; done: number }> {
  const counts = new Map<string, { open: number; done: number }>();
  for (const row of rows) {
    const shown = { status: laneStage(row.status, row.column) };
    if (isSetAside(shown)) continue;
    const c = counts.get(row.board_id) ?? { open: 0, done: 0 };
    if (isDone(shown)) c.done += 1;
    else c.open += 1;
    counts.set(row.board_id, c);
  }
  return counts;
}
