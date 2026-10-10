import { describe, expect, it } from "vitest";
import { splitNotDone } from "./sprint-planning-sections";
import type { PlanningBoard } from "./sprint-planning";
import type { TaskPriority } from "./types";

// W.18: carried on top, priority-sorted. W.112: the backlog reads like the
// board's To do, due-soon first, and the rest keeps the order it came in.

const pb = { next: { id: "s2" } } as PlanningBoard;
const TODAY = "2026-09-23";
const card = (id: string, priority: TaskPriority, sprint_id: string | null, created_at: string, due_date: string | null = null) => ({
  id,
  status: "open" as const,
  priority,
  sprint_id,
  created_at,
  due_date,
});

describe("splitNotDone", () => {
  it("separates the cards an earlier sprint did not finish from the backlog", () => {
    const { carried, backlog } = splitNotDone(
      [card("a", "p3", "s1", "2026-06-01"), card("b", "p1", null, "2026-09-01")],
      pb,
      TODAY,
    );
    expect(carried.map((c) => c.id)).toEqual(["a"]);
    expect(backlog.map((c) => c.id)).toEqual(["b"]);
  });

  it("puts a carried P1 above a carried P3 however old the P3 is", () => {
    const { carried } = splitNotDone(
      [card("old-p3", "p3", "s1", "2026-01-01"), card("new-p1", "p1", "s1", "2026-09-15"), card("p2", "p2", "s1", "2026-02-01")],
      pb,
      TODAY,
    );
    expect(carried.map((c) => c.id)).toEqual(["new-p1", "p2", "old-p3"]);
  });

  it("puts the longest-waiting first inside one priority", () => {
    const { carried } = splitNotDone(
      [card("newer", "p1", "s1", "2026-09-15"), card("older", "p1", "s1", "2026-08-01")],
      pb,
      TODAY,
    );
    expect(carried.map((c) => c.id)).toEqual(["older", "newer"]);
  });

  it("leaves the backlog in the order it was given", () => {
    const { backlog } = splitNotDone([card("z", "p3", null, "2026-06-01"), card("a", "p1", null, "2026-07-01")], pb, TODAY);
    expect(backlog.map((c) => c.id)).toEqual(["z", "a"]);
  });

  it("puts backlog cards due in the next fortnight first, soonest first, and keeps the rest in order", () => {
    const { backlog } = splitNotDone(
      [
        card("undated", "p1", null, "2026-06-01"),
        card("late-october", "p1", null, "2026-06-02", "2026-10-30"),
        card("due-friday", "p3", null, "2026-06-03", "2026-09-25"),
        card("due-tomorrow", "p3", null, "2026-06-04", "2026-09-24"),
      ],
      pb,
      TODAY,
    );
    expect(backlog.map((c) => c.id)).toEqual(["due-tomorrow", "due-friday", "undated", "late-october"]);
  });

  it("counts a card already committed to the next sprint as neither", () => {
    // planningColumn never hands such a card to this column, but the rule that
    // decides "carried" is the same one, so it must agree here too.
    const { carried, backlog } = splitNotDone([card("committed", "p1", "s2", "2026-09-01")], pb, TODAY);
    expect(carried).toEqual([]);
    expect(backlog.map((c) => c.id)).toEqual(["committed"]);
  });
});
