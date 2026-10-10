import type { WorkboardCard, WorkboardLane } from "./workboard";

// What one person's cards say about their work, decided once for every
// reporting agent (U.2).
//
// The daily check-in, the morning board digest and the Tuesday individual
// summary each used to classify cards for themselves, and the copies had
// drifted: the check-in matched the in-progress lane by its whole name while
// the summary matched any lane name CONTAINING "doing", so the two could
// disagree about which lanes held work in progress; the summary
// counted a card as finished only by its completion stamp while the check-in
// also took a move into Done; and the digest read the tasks table on its own.
// A person reading two of these on the same morning could be told two
// different things about the same board. Each agent now reads the board
// through readBoardState (board-state-read.ts) and classifies a person's cards
// here, so the numbers they print are the same numbers.
//
// Pure, with no server imports, so the check-in's composer and its tests can
// use it without loading the boards barrel.

/** The board as a reporting agent reads it: every active board, its lanes, and its top-level cards. */
export type BoardState = { lanes: WorkboardLane[]; cards: WorkboardCard[] };

/**
 * Whether a lane is the one people work in, by the names boards actually give
 * that column.
 *
 * It is a name match because `is_done` and `is_not_doing` are the only flags a
 * column carries; nothing on `board_columns` says "this is where work is in
 * progress". It is anchored, so "Not doing" is never read as in progress. The
 * structural fix is a kind on the column; until then this is the one place
 * that decides.
 */
export function isInProgressLane(name: string): boolean {
  return /^(doing|in[\s-]?progress)$/i.test(name.trim());
}

/** One person's cards, as every reporting agent counts them. */
export type PersonBoardState = {
  /** Still work: open, and in neither a done lane nor the Not Doing lane. */
  open: WorkboardCard[];
  /** The open cards in the in-progress lane. */
  doing: WorkboardCard[];
  /** The open cards anywhere else: To do, Waiting, and any lane a board adds. */
  waiting: WorkboardCard[];
  /** Finished inside the window: completed, or moved into a done lane, at or after `doneSince`. */
  done: WorkboardCard[];
};

function within(iso: string | null | undefined, since: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= since;
}

/**
 * The cards assigned to `personId`, sorted into what the reports name.
 * `doneSince` is the start of the window the caller reports finished work
 * over (epoch ms): 24 hours for the check-in, 72 across a weekend, seven days
 * for the weekly summary.
 *
 * A card's status is already the lane's (laneStatus in workboard-lanes.ts, as
 * getWorkboard returns it), and the lane test is repeated for a state built
 * by hand, as the tests build it.
 */
export function personBoardState(state: BoardState, personId: string, doneSince: number): PersonBoardState {
  const doneLanes = new Set(state.lanes.filter((l) => l.isDone).map((l) => l.id));
  const notDoingLanes = new Set(state.lanes.filter((l) => l.isNotDoing).map((l) => l.id));
  const doingLanes = new Set(
    state.lanes.filter((l) => !l.isDone && !l.isNotDoing && isInProgressLane(l.name)).map((l) => l.id),
  );
  const mine = state.cards.filter((c) => c.assignee_id === personId);
  const open = mine.filter((c) => c.status === "open" && !doneLanes.has(c.laneId) && !notDoingLanes.has(c.laneId));
  // A card finished inside the window belongs in Done whether it travelled to
  // a done lane or was completed where it sat: `last_column_move_at` is null
  // until there is a move row, so a card marked done in place has only its
  // completion stamp, and a card dragged into Done by a hand-run write may
  // have only the move.
  const done = mine.filter(
    (c) =>
      (c.status === "done" || doneLanes.has(c.laneId)) &&
      (within(c.completed_at, doneSince) || within(c.last_column_move_at, doneSince)),
  );
  return {
    open,
    doing: open.filter((c) => doingLanes.has(c.laneId)),
    waiting: open.filter((c) => !doingLanes.has(c.laneId)),
    done,
  };
}
