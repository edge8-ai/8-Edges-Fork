import { describe, expect, it } from "vitest";
import {
  CLOSED_STATUS_LIST,
  isClosed,
  isDone,
  isOpen,
  isSetAside,
  laneStage,
  stageCountsByBoard,
  stageOfColumn,
  type ColumnFlags,
} from "./card-stage";
import { splitCardChildren } from "./workboard-children";
import { shapeCard, type CardShapeContext } from "./workboard-card-shape";
import { TASK_STATUSES, type BoardColumnRow, type TaskRow, type TaskStatus } from "./types";

// One table for the card's stage (A.42): every stored status in every kind of
// column, and what each predicate answers about the card the board shows.
// Rows are [stored status, column, the stage the board shows].

const COLUMNS: Record<string, ColumnFlags | undefined> = {
  "no column": undefined,
  "an open column": { is_done: false, is_not_doing: false },
  "a done column": { is_done: true, is_not_doing: false },
  "a Not Doing column": { is_done: false, is_not_doing: true },
};

const SHOWN: Record<string, (stored: TaskStatus) => TaskStatus> = {
  // With no column, or in an open one, the stored status stands: a card
  // marked done where it sits is finished and not yet moved (W.111).
  "no column": (stored) => stored,
  "an open column": (stored) => stored,
  // A done or Not Doing lane wins over the stored status, which only
  // disagrees with it after a hand-run write.
  "a done column": () => "done",
  "a Not Doing column": () => "not_doing",
};

const TABLE = TASK_STATUSES.flatMap((stored) =>
  Object.keys(COLUMNS).map((where) => [stored, where, SHOWN[where](stored)] as const),
);

const PREDICATES: Record<TaskStatus, { open: boolean; done: boolean; setAside: boolean; closed: boolean }> = {
  open: { open: true, done: false, setAside: false, closed: false },
  done: { open: false, done: true, setAside: false, closed: true },
  not_doing: { open: false, done: false, setAside: true, closed: true },
};

describe("a card's stage, stored status × column × predicate (A.42)", () => {
  it.each(TABLE)("a card stored %s in %s shows as %s", (stored, where, shown) => {
    const card = { status: laneStage(stored, COLUMNS[where]) };
    expect(card.status).toBe(shown);
    expect({ open: isOpen(card), done: isDone(card), setAside: isSetAside(card), closed: isClosed(card) }).toEqual(PREDICATES[shown]);
  });

  it("gives every column the status a card takes there: the writers' rule", () => {
    expect(stageOfColumn({ is_done: false, is_not_doing: false })).toBe("open");
    expect(stageOfColumn({ is_done: false })).toBe("open");
    expect(stageOfColumn({ is_done: true, is_not_doing: false })).toBe("done");
    expect(stageOfColumn({ is_done: false, is_not_doing: true })).toBe("not_doing");
  });

  it("agrees with the readers' rule for a card written into its column by the app", () => {
    for (const column of Object.values(COLUMNS)) {
      if (!column) continue;
      const written = stageOfColumn(column);
      expect(laneStage(written, column)).toBe(written);
    }
  });

  it("answers no stage for a status it does not know, and closed for neither", () => {
    for (const card of [{ status: "archived" }, { status: null }, {}]) {
      expect([isOpen(card), isDone(card), isSetAside(card), isClosed(card)]).toEqual([false, false, false, false]);
    }
  });

  it("names both closed stages in the server filter's list", () => {
    expect(CLOSED_STATUS_LIST).toBe("(done,not_doing)");
  });
});

// The board index (listBoards in data.ts) counts with stageCountsByBoard and
// the Workboard shows each card through shapeCard. Before A.42 the index read
// the stored status and the Workboard the lane, so the two disagreed on a row
// written from outside the app. Every row of the table goes through both here.
describe("the board index and the Workboard count a card the same way (A.42)", () => {
  const columnRow = (id: string, flags: ColumnFlags): BoardColumnRow =>
    ({ id, board_id: "b1", name: id, position: 0, is_done: flags.is_done, is_not_doing: !!flags.is_not_doing, wip_limit: null }) as BoardColumnRow;
  const columnById = new Map(
    Object.entries(COLUMNS)
      .filter((e): e is [string, ColumnFlags] => !!e[1])
      .map(([where, flags]) => [where, columnRow(where, flags)]),
  );
  const ctx: CardShapeContext = {
    columnById,
    nameById: new Map(),
    subjectLabel: new Map(),
    children: splitCardChildren([]),
    cardTitle: new Map(),
    commentsByTask: new Map(),
    commentsFailed: false,
    lastMove: new Map(),
    firstLane: "an open column",
    clientSafe: false,
  };
  const task = (stored: TaskStatus, where: string) =>
    ({ id: `${stored}-${where}`, board_id: "b1", board_column_id: COLUMNS[where] ? where : null, status: stored, created_at: "2026-10-01T00:00:00Z" }) as unknown as TaskRow;

  it.each(TABLE)("a card stored %s in %s", (stored, where) => {
    const shown = shapeCard(task(stored, where), ctx);
    const index = stageCountsByBoard([{ board_id: "b1", status: stored, column: COLUMNS[where] }]).get("b1") ?? { open: 0, done: 0 };
    expect(index).toEqual({ open: isOpen(shown) ? 1 : 0, done: isDone(shown) ? 1 : 0 });
  });

  it("totals a board's rows, leaving set-aside cards out of both numbers", () => {
    const rows = TABLE.map(([stored, where]) => ({ board_id: "b1", status: stored, column: COLUMNS[where] }));
    const shown = TABLE.map(([stored, where]) => shapeCard(task(stored, where), ctx));
    expect(stageCountsByBoard(rows).get("b1")).toEqual({
      open: shown.filter((c) => isOpen(c)).length,
      done: shown.filter((c) => isDone(c)).length,
    });
    expect(stageCountsByBoard(rows).get("b1")).toEqual({ open: 2, done: 5 });
  });

  it("keeps each board's numbers apart and leaves out a board with only set-aside cards", () => {
    const counts = stageCountsByBoard([
      { board_id: "b1", status: "open", column: undefined },
      { board_id: "b2", status: "done", column: undefined },
      { board_id: "b3", status: "not_doing", column: undefined },
    ]);
    expect([...counts.entries()]).toEqual([
      ["b1", { open: 1, done: 0 }],
      ["b2", { open: 0, done: 1 }],
    ]);
  });
});
