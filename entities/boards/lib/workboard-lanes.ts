import type { BoardColumnRow } from "./types";

/**
 * A board lane: one column NAME, as every board in scope spells it.
 *
 * A lane is not a column. Across several boards "In progress" is several
 * different `board_columns` rows, and the board draws one lane for all of
 * them — which is the whole reason a card's `laneId` is a name rather than
 * an id. This file is where that translation happens, and the only place
 * that decides what a lane inherits from the columns behind it.
 */
export type WorkboardLane = {
  id: string;
  name: string;
  isDone: boolean;
  /** The Not Doing lane: a card dropped here closes without being done. */
  isNotDoing: boolean;
  /**
   * The column's work-in-progress limit (W.31), or null when it claims none.
   *
   * Only ever set with ONE board in scope. Across boards a lane stands for
   * several real columns with several different limits, and a number made
   * out of them would describe no column that exists — so a many-board scope
   * simply has no limit to show, which is the honest answer rather than a
   * sum. `laneWipLimits` takes `single` for exactly this reason.
   */
  wipLimit: number | null;
};

/** Every column indexed by id, and every board's columns in position order. */
export function indexColumns(columns: BoardColumnRow[]): {
  columnById: Map<string, BoardColumnRow>;
  columnsByBoard: Map<string, BoardColumnRow[]>;
} {
  const columnById = new Map<string, BoardColumnRow>();
  const columnsByBoard = new Map<string, BoardColumnRow[]>();
  for (const c of columns) {
    columnById.set(c.id, c);
    columnsByBoard.set(c.board_id, [...(columnsByBoard.get(c.board_id) ?? []), c]);
  }
  return { columnById, columnsByBoard };
}

/**
 * The board's lanes, in column order and deduped by name: the first board to
 * name a lane fixes its position.
 *
 * A lane is "done" only when EVERY column of that name is — a card dropped
 * into a lane that closes it on one board and not on another must not be
 * silently completed, so the permissive reading loses.
 *
 * `singleBoard` says whether one board is in scope; only then does a lane
 * carry a WIP limit. See WorkboardLane.wipLimit.
 */
export function buildLanes(columns: BoardColumnRow[], singleBoard: boolean): WorkboardLane[] {
  const order: string[] = [];
  const done = new Map<string, boolean>();
  // Not Doing follows the same rule as done: every column of the name must be one.
  const notDoing = new Map<string, boolean>();
  for (const c of columns) {
    if (!done.has(c.name)) {
      order.push(c.name);
      done.set(c.name, c.is_done);
      notDoing.set(c.name, Boolean(c.is_not_doing));
    } else {
      if (!c.is_done) done.set(c.name, false);
      if (!c.is_not_doing) notDoing.set(c.name, false);
    }
  }
  const limits = new Map<string, number | null>(singleBoard ? columns.map((c) => [c.name, c.wip_limit]) : []);
  return order.map((name) => ({
    id: name,
    name,
    isDone: done.get(name) ?? false,
    isNotDoing: notDoing.get(name) ?? false,
    wipLimit: limits.get(name) ?? null,
  }));
}

/**
 * A card's status as the board shows it: done when it sits in a done lane,
 * whatever the stored status says (W.111).
 *
 * Every write the app makes sets `status` from the target column's `is_done`
 * (actions.ts, land-card.ts), so the two only disagree when a row is written
 * from outside the app — a hand-run SQL update that moved the column and not
 * the status. One such card sat in Done with status "open" from 2026-09-21,
 * and the Calendar and My Week, which read status, listed it as overdue with a
 * Done badge beside it. The lane is what every reader of the board sees, so
 * the lane wins here, once, and every surface downstream agrees with it.
 * The other direction is left alone: a card marked done in an open lane is a
 * card somebody finished and has not moved yet, which the board already shows.
 */
export function laneStatus<S extends string>(
  status: S,
  column: { is_done: boolean; is_not_doing?: boolean } | undefined,
): S | "done" | "not_doing" {
  if (column?.is_done) return "done";
  return column?.is_not_doing ? "not_doing" : status;
}
