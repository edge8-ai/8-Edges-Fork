import { describe, expect, it } from "vitest";
import { buildLanes, indexColumns } from "./workboard-lanes";
import { DEFAULT_COLUMNS, type BoardColumnRow } from "./types";

const col = (over: Partial<BoardColumnRow>): BoardColumnRow => ({
  id: "c1",
  board_id: "b1",
  name: "To do",
  position: 0,
  is_done: false,
  wip_limit: null,
  is_not_doing: false,
  ...over,
});

describe("buildLanes", () => {
  it("keeps column order and dedupes by name across boards", () => {
    const lanes = buildLanes(
      [
        col({ id: "a1", board_id: "b1", name: "To do", position: 0 }),
        col({ id: "a2", board_id: "b1", name: "Doing", position: 1 }),
        col({ id: "b1c", board_id: "b2", name: "To do", position: 0 }),
      ],
      false,
    );
    expect(lanes.map((l) => l.id)).toEqual(["To do", "Doing"]);
  });

  it("calls a lane done only when every column of that name is", () => {
    const lanes = buildLanes(
      [
        col({ id: "x", board_id: "b1", name: "Done", is_done: true }),
        col({ id: "y", board_id: "b2", name: "Done", is_done: false }),
      ],
      false,
    );
    // The permissive reading loses: a drop here must not silently complete a
    // card that one of the two boards does not consider finished.
    expect(lanes[0].isDone).toBe(false);
  });

  it("carries a WIP limit with one board in scope", () => {
    const lanes = buildLanes([col({ name: "Doing", wip_limit: 5 })], true);
    expect(lanes[0].wipLimit).toBe(5);
  });

  it("carries NO WIP limit across boards, rather than inventing one", () => {
    const lanes = buildLanes(
      [
        col({ id: "x", board_id: "b1", name: "Doing", wip_limit: 5 }),
        col({ id: "y", board_id: "b2", name: "Doing", wip_limit: 2 }),
      ],
      false,
    );
    // A lane across boards stands for several real columns with several
    // different limits; any number here would describe no column that exists.
    expect(lanes[0].wipLimit).toBeNull();
  });

  it("leaves a column with no limit null", () => {
    expect(buildLanes([col({ wip_limit: null })], true)[0].wipLimit).toBeNull();
  });
});

describe("indexColumns", () => {
  it("indexes by id and groups by board", () => {
    const a = col({ id: "a", board_id: "b1" });
    const b = col({ id: "b", board_id: "b2" });
    const { columnById, columnsByBoard } = indexColumns([a, b]);
    expect(columnById.get("a")).toBe(a);
    expect(columnsByBoard.get("b2")).toEqual([b]);
  });
});

describe("Not Doing (2026-09-24)", () => {
  it("marks a lane Not Doing only when every column of that name is one", () => {
    const lanes = buildLanes(
      [col({ id: "a", name: "Not Doing", position: 4, is_not_doing: true }), col({ id: "b", board_id: "b2", name: "Not Doing", position: 4, is_not_doing: true })],
      false,
    );
    expect(lanes).toEqual([expect.objectContaining({ id: "Not Doing", isDone: false, isNotDoing: true })]);
    const mixed = buildLanes([col({ id: "a", name: "Parked", is_not_doing: true }), col({ id: "b", board_id: "b2", name: "Parked" })], false);
    expect(mixed[0].isNotDoing).toBe(false);
  });
  // A card's stage in a Not Doing lane, and each column's stage, are
  // card-stage.test.ts's table (A.42).
  it("seeds every new board with Not Doing after Done", () => {
    expect(DEFAULT_COLUMNS.map((c) => c.name)).toEqual(["To do", "Doing", "Waiting", "Done", "Not Doing"]);
    expect(DEFAULT_COLUMNS.filter((c) => c.is_done && c.is_not_doing)).toEqual([]);
  });
});
