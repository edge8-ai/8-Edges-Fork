import { describe, expect, it } from "vitest";
import { shapeCard, type CardShapeContext } from "./workboard-card-shape";
import type { BoardColumnRow, TaskRow } from "./types";

// W.207.4. The loader stamps a card with the one fact every surface reads to
// dim its date and leave it out of Overdue: it is filed in a Waiting lane.

const column = (id: string, name: string) => ({ id, name, is_done: false, is_not_doing: false }) as unknown as BoardColumnRow;
const ctx = {
  columnById: new Map([column("c1", "To do"), column("c2", "Waiting")].map((c) => [c.id, c])),
  nameById: new Map(),
  subjectLabel: new Map(),
  children: { subtasksByParent: new Map(), blockersByParent: new Map(), blocksCount: new Map() },
  cardTitle: new Map(),
  commentsByTask: new Map(),
  commentsFailed: false,
  lastMove: new Map(),
  firstLane: "To do",
  clientSafe: false,
} as unknown as CardShapeContext;

const task = (columnId: string | null) =>
  ({ id: "t1", title: "Card", board_column_id: columnId, status: "open", metadata: {}, created_at: "2026-11-01T00:00:00Z" }) as unknown as TaskRow;

describe("shapeCard: waiting", () => {
  it("marks a card filed in a Waiting lane", () => {
    expect(shapeCard(task("c2"), ctx).waiting).toBe(true);
  });

  it("leaves every other card unmarked", () => {
    expect(shapeCard(task("c1"), ctx).waiting).toBeUndefined();
    expect(shapeCard(task(null), ctx).waiting).toBeUndefined();
  });
});
