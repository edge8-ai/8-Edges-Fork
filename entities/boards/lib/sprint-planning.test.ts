import { describe, expect, it } from "vitest";
import { doneWindow, dueBeforeSprint, isCarried, planningBoards, planningColumn, planningWeeks } from "./sprint-planning";
import type { PlanningBoard } from "./sprint-planning";

// The planning view's rule: which boards take part, which sprint is "next",
// which sprints "Finish planning" closes, and which column a card sits in.

const board = (id: string, chat: string | null) => ({ id, name: id, slug: id, description: null, client_company_id: null, ai_program_id: null, owner_id: null, status: "active" as const, sort_order: 0, metadata: chat ? { weekly_sprints: chat } : {}, client_name: null, client_color: null, program_name: null, columns: [], laneColumn: {} });
const sprint = (id: string, board_id: string, starts_on: string, status = "active", week: string | null = null) => ({ id, board_id, name: id, goal: null, starts_on, ends_on: null, status: status as "active" | "closed", sort_order: 0, meeting_id: null, focus_improvement: null, going_well: null, meeting_summary: null, week, locked_at: null });

describe("planningBoards", () => {
  it("takes weekly boards only, with the newest active sprint as next and the rest ending", () => {
    const data = {
      boards: [board("a", "product"), board("b", null)],
      sprints: [sprint("s1", "a", "2026-09-09"), sprint("s2", "a", "2026-09-16"), sprint("s0", "a", "2026-09-01", "closed"), sprint("x", "b", "2026-09-16")],
    };
    const out = planningBoards(data);
    expect(out.map((p) => p.board.id)).toEqual(["a"]);
    expect(out[0].next?.id).toBe("s2");
    expect(out[0].ending.map((s) => s.id)).toEqual(["s1"]);
  });

  it("has no next sprint on a board the routine has not reached yet", () => {
    expect(planningBoards({ boards: [board("a", "eo")], sprints: [] })[0].next).toBeNull();
  });

  it("reads a chosen week back: that week's sprint is next, older active ones are ending", () => {
    const data = {
      boards: [board("a", "product")],
      sprints: [sprint("s1", "a", "2026-09-09", "closed", "2026-W37"), sprint("s2", "a", "2026-09-16", "active", "2026-W38"), sprint("s0", "a", "2026-09-02", "active", "2026-W36")],
    };
    const [pb] = planningBoards(data, "2026-W37");
    expect(pb.next?.id).toBe("s1");
    expect(pb.ending.map((s) => s.id)).toEqual(["s0"]);
    expect(planningBoards(data, "2026-W30")[0].next).toBeNull();
  });
});

describe("planningWeeks", () => {
  it("lists the weekly boards' weeks newest first, once each, ignoring boards that plan by hand", () => {
    const data = {
      boards: [board("a", "product"), board("b", null)],
      sprints: [sprint("s1", "a", "2026-09-09", "closed", "2026-W37"), sprint("s2", "a", "2026-09-16", "active", "2026-W38"), sprint("s3", "a", "2026-09-01", "closed", null), sprint("x", "b", "2026-09-23", "active", "2026-W39")],
    };
    expect(planningWeeks(data)).toEqual(["2026-W38", "2026-W37"]);
  });
});

describe("doneWindow", () => {
  it("is the last seven days for the live week and the Wednesday-to-Tuesday span for a chosen one", () => {
    expect(doneWindow(null, "2026-09-16")).toEqual({ since: "2026-09-09", until: null });
    expect(doneWindow("2026-W37", "2026-09-16")).toEqual({ since: "2026-09-09", until: "2026-09-16" });
  });
});

describe("planningColumn", () => {
  const pb: PlanningBoard = { board: board("a", "product"), chat: "product", next: sprint("s2", "a", "2026-09-16"), ending: [sprint("s1", "a", "2026-09-09")] };
  const since = "2026-09-09";

  it("puts committed cards in next, everything else open, and recent done in done", () => {
    expect(planningColumn({ status: "open", sprint_id: "s2", completed_at: null }, pb, since)).toBe("next");
    expect(planningColumn({ status: "open", sprint_id: "s1", completed_at: null }, pb, since)).toBe("open");
    expect(planningColumn({ status: "open", sprint_id: null, completed_at: null }, pb, since)).toBe("open");
    expect(planningColumn({ status: "done", sprint_id: "s1", completed_at: "2026-09-12T00:00:00Z" }, pb, since)).toBe("done");
    expect(planningColumn({ status: "done", sprint_id: "s1", completed_at: "2026-09-01T00:00:00Z" }, pb, since)).toBeNull();
  });

  it("leaves Not Doing cards out of planning, committed or not, and never calls them carried", () => {
    expect(planningColumn({ status: "not_doing", sprint_id: "s2", completed_at: null }, pb, since)).toBeNull();
    expect(planningColumn({ status: "not_doing", sprint_id: null, completed_at: null }, pb, since)).toBeNull();
    expect(isCarried({ status: "not_doing", sprint_id: "s1" }, pb)).toBe(false);
  });

  it("keeps done to the chosen week's window when one is given", () => {
    expect(planningColumn({ status: "done", sprint_id: "s1", completed_at: "2026-09-12T00:00:00Z" }, pb, since, "2026-09-16")).toBe("done");
    expect(planningColumn({ status: "done", sprint_id: "s1", completed_at: "2026-09-16T01:00:00Z" }, pb, since, "2026-09-16")).toBeNull();
  });

  it("flags as carried only an open card from another sprint", () => {
    expect(isCarried({ status: "open", sprint_id: "s1" }, pb)).toBe(true);
    expect(isCarried({ status: "open", sprint_id: "s2" }, pb)).toBe(false);
    expect(isCarried({ status: "open", sprint_id: null }, pb)).toBe(false);
    expect(isCarried({ status: "done", sprint_id: "s1" }, pb)).toBe(false);
  });
});

// W.112: a card committed with a due date before the sprint starts is red
// from the first morning, so the page offers to move it.
describe("dueBeforeSprint", () => {
  const c = (id: string, due_date: string | null, status: "open" | "done" = "open") => ({ id, due_date, status });

  it("finds the open cards due before the sprint's first day", () => {
    const out = dueBeforeSprint([c("late", "2026-09-22"), c("first-day", "2026-09-23"), c("undated", null), c("done", "2026-09-01", "done")], { starts_on: "2026-09-23" });
    expect(out.map((x) => x.id)).toEqual(["late"]);
  });

  it("reads a timestamp by its date, and finds nothing for a sprint with no start", () => {
    expect(dueBeforeSprint([c("late", "2026-09-22T23:00:00Z")], { starts_on: "2026-09-23" })).toHaveLength(1);
    expect(dueBeforeSprint([c("late", "2026-09-22")], { starts_on: null })).toEqual([]);
    expect(dueBeforeSprint([c("late", "2026-09-22")], null)).toEqual([]);
  });
});
