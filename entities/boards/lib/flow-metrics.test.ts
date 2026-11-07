import { describe, expect, it } from "vitest";
import { aggregateFlow, type FlowTask } from "./flow-metrics";

// The Flow view's numbers from fixtures (RH-6): aging from the stage log, the
// blocked and overdue counts, the weekly created and completed series, and the
// per-board table. The task rows here carry no assignee and the log rows no
// mover; that is the shape the aggregate accepts.

const NOW = new Date("2026-09-13T12:00:00Z");
const BOARDS = [
  { id: "b1", name: "Alpha", slug: "alpha", client_company_id: "co" },
  { id: "b2", name: "Empty", slug: "empty", client_company_id: null },
];
const COLUMNS = [
  { id: "todo", board_id: "b1", name: "To do", position: 0, is_done: false },
  { id: "doing", board_id: "b1", name: "Doing", position: 1, is_done: false },
  { id: "done", board_id: "b1", name: "Done", position: 2, is_done: true },
];
const task = (o: Partial<FlowTask> & { id: string }): FlowTask => ({
  board_id: "b1", board_column_id: "todo", status: "open", priority: "p2", due_date: null,
  created_at: "2026-09-10T00:00:00Z", completed_at: null, parent_task_id: null, metadata: {}, ...o,
});

describe("aggregateFlow", () => {
  it("is empty-safe with a full weekly axis", () => {
    const m = aggregateFlow(BOARDS, COLUMNS, [], [], NOW);
    expect(m.open).toBe(0);
    expect(m.weekly).toHaveLength(12);
    expect(m.perBoard).toEqual([]);
  });

  it("ages a card from the log row that put it in its column, counts blocked and overdue, and drops boards with no cards", () => {
    const tasks = [
      task({ id: "a", board_column_id: "doing", created_at: "2026-06-01T00:00:00Z", due_date: "2026-09-01" }),
      task({ id: "b", board_column_id: "todo", created_at: "2026-09-12T00:00:00Z", priority: "p1" }),
      task({ id: "c", board_column_id: "done", status: "done", created_at: "2026-09-01T00:00:00Z", completed_at: "2026-09-11T00:00:00Z" }),
      task({ id: "blk", parent_task_id: "b", metadata: { kind: "blocker" }, status: "open" }),
      task({ id: "sub", parent_task_id: "a", metadata: { kind: "subtask" }, status: "open" }),
    ];
    const log = [
      { task_id: "a", to_column_id: "doing", moved_at: "2026-08-20T00:00:00Z" },
      { task_id: "a", to_column_id: "todo", moved_at: "2026-06-01T00:00:00Z" },
    ];
    const m = aggregateFlow(BOARDS, COLUMNS, tasks, log, NOW);
    expect(m.open).toBe(2);
    expect(m.done).toBe(1);
    expect(m.blocked).toBe(1);
    expect(m.overdue).toBe(1);
    expect(m.noDueDate).toBe(1);
    // a entered Doing 24 days ago (log), b was created yesterday (no log).
    expect(m.agingInColumn).toEqual([{ label: "0–7 d", value: 1 }, { label: "8–30 d", value: 1 }, { label: "31–90 d", value: 0 }, { label: "90+ d", value: 0 }]);
    expect(m.byPriority).toEqual([{ label: "p1", value: 1 }, { label: "p2", value: 1 }]);
    // The clock is Sunday the 13th, so "this week" starts that day and holds
    // nothing; b's creation (12th) and c's completion (11th) sit in the week
    // before.
    expect(m.weekly[m.weekly.length - 1]).toMatchObject({ week: "2026-09-13", created: 0, completed: 0 });
    expect(m.weekly[m.weekly.length - 2]).toMatchObject({ week: "2026-09-06", created: 1, completed: 1 });
    expect(m.perBoard).toHaveLength(1);
    expect(m.perBoard[0]).toMatchObject({ name: "Alpha", client: true, open: 2, done: 1, blocked: 1, overdue: 1, oldestDays: 24 });
    expect(m.perBoard[0].columns.map((c) => [c.name, c.open, c.oldestDays])).toEqual([["To do", 1, 1], ["Doing", 1, 24], ["Done", 0, 0]]);
  });

  // W.121. The Overdue tile links to the board's Overdue filter, so it counts
  // by the board's rule: due strictly before today's Saigon date. At 07:30 in
  // Saigon it is still 00:30 UTC, and the old `new Date(due_date) < now` had
  // already made a card due today overdue.
  it("does not count a card due today as overdue, at 07:30 in Saigon", () => {
    const at = new Date("2026-09-13T00:30:00Z");
    const m = aggregateFlow(BOARDS, COLUMNS, [task({ id: "today", due_date: "2026-09-13" }), task({ id: "yesterday", due_date: "2026-09-12" })], [], at);
    expect(m.overdue).toBe(1);
  });

  // W.121 review. The tiles link to the board's filter, so they count the
  // cards the board shows: a card in a done column is done (W.111) and a
  // snoozed card is parked off the board (W.54).
  it("counts neither a card sitting in Done nor a snoozed card on the Blocked and Overdue tiles", () => {
    const m = aggregateFlow(BOARDS, COLUMNS, [
      task({ id: "in-done", board_column_id: "done", status: "open", due_date: "2026-09-01" }),
      task({ id: "snoozed", due_date: "2026-09-01", metadata: { snoozed_until: "2026-12-01" } }),
      task({ id: "counted", due_date: "2026-09-01" }),
    ], [], NOW);
    expect(m.overdue).toBe(1);
    expect(m.open).toBe(2);
    expect(m.done).toBe(1);
  });

  // W.139: #1677 made a card's status three-valued. The headline derived done
  // as "not open", so a card set aside in Not Doing counted as finished there
  // while the per-board row beside it did not.
  it("counts a Not Doing card as neither open nor done, in the headline and on its board", () => {
    const cols = [...COLUMNS, { id: "nd", board_id: "b1", name: "Not Doing", position: 3, is_done: false, is_not_doing: true }];
    const tasks = [
      task({ id: "a", board_column_id: "todo" }),
      task({ id: "c", board_column_id: "done", status: "done", completed_at: "2026-09-11T00:00:00Z" }),
      task({ id: "x", board_column_id: "nd", status: "not_doing" }),
      // Still "open" on the row: the lane decides, as the board reads it.
      task({ id: "y", board_column_id: "nd", status: "open" }),
    ];
    const m = aggregateFlow(BOARDS, cols, tasks, [], NOW);
    expect(m.open).toBe(1);
    expect(m.done).toBe(1);
    expect(m.perBoard[0]).toMatchObject({ open: 1, done: 1 });
  });
});
