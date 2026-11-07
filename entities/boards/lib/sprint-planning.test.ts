import { describe, expect, it } from "vitest";
import { commitmentLocked, doneWindow, dueBeforeSprint, isCarried, mayChangeCommitment, pickRun, pickableIds, planningBoards, planningColumn, planningMoves, planningWeeks } from "./sprint-planning";
import type { PlanningBoard } from "./sprint-planning";

// The planning view's rule: which boards take part, which sprint is "next",
// which sprints "Finish planning" closes, and which column a card sits in.

const board = (id: string, chat: string | null) => ({ id, name: id, slug: id, description: null, client_company_id: null, ai_program_id: null, owner_id: null, status: "active" as const, sort_order: 0, metadata: chat ? { weekly_sprints: chat } : {}, client_name: null, client_color: null, program_name: null, columns: [], laneColumn: {} });
const sprint = (id: string, board_id: string, starts_on: string, status = "active", week: string | null = null, locked_at: string | null = null) => ({ id, board_id, name: id, goal: null, starts_on, ends_on: null, status: status as "active" | "closed", sort_order: 0, meeting_id: null, focus_improvement: null, going_well: null, meeting_summary: null, week, locked_at });

describe("planningBoards", () => {
  it("takes weekly boards only, with the week's sprint as next and the older active ones ending", () => {
    const data = {
      boards: [board("a", "product"), board("b", null)],
      sprints: [sprint("s1", "a", "2026-09-09"), sprint("s2", "a", "2026-09-16"), sprint("s0", "a", "2026-09-01", "closed"), sprint("x", "b", "2026-09-16")],
    };
    // No week keys: the sprint that holds the week's first day is the one.
    const out = planningBoards(data, "2026-W38");
    expect(out.map((p) => p.board.id)).toEqual(["a"]);
    expect(out[0].next?.id).toBe("s2");
    expect(out[0].ending.map((s) => s.id)).toEqual(["s1"]);
  });

  it("has no next sprint on a board the routine has not reached yet", () => {
    expect(planningBoards({ boards: [board("a", "eo")], sprints: [] }, "2026-W38")[0].next).toBeNull();
  });

  // W.202.1, a client board on 2026-10-21: four sprints planned ahead, all active.
  // "Newest active" made W46 the next sprint, showed the week's 33 committed
  // cards as carried, and Finish planning would have closed W43 to W45.
  it("plans the week's sprint, never a roadmap sprint opened weeks ahead, and ends none of those", () => {
    const data = {
      boards: [board("rw", "product")],
      sprints: [
        sprint("w43", "rw", "2026-10-21", "active", "2026-W43", "2026-10-21T03:18:01Z"),
        sprint("w44", "rw", "2026-10-28", "active", "2026-W44"),
        sprint("w45", "rw", "2026-11-04", "active", "2026-W45"),
        sprint("w46", "rw", "2026-11-11", "active", "2026-W46"),
      ],
    };
    const [pb] = planningBoards(data, "2026-W43");
    expect(pb.next?.id).toBe("w43");
    expect(pb.ending).toEqual([]);
  });

  it("ends only the sprints older than the week's, never a future one, even when the week has no sprint yet", () => {
    const data = {
      boards: [board("a", "product")],
      // A finished sprint nobody closed yet: it ended the day before the week began.
      sprints: [{ ...sprint("w42", "a", "2026-10-14", "active", "2026-W42"), ends_on: "2026-10-20" }, sprint("w45", "a", "2026-11-04", "active", "2026-W45")],
    };
    const [pb] = planningBoards(data, "2026-W43");
    expect(pb.next).toBeNull();
    expect(pb.ending.map((s) => s.id)).toEqual(["w42"]);
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
  // Review of W.202, (c)3: the fallback is for a sprint made without a week
  // key. A keyed sprint from another week that has no end date (or a long
  // one) must not stand in for the week's missing sprint.
  it("falls back only to a sprint with no week key, never to another week's sprint that spans this one", () => {
    const keyedOld = sprint("w42", "a", "2026-10-14", "active", "2026-W42");
    const unkeyed = { ...sprint("hand", "b", "2026-10-21", "active", null), ends_on: "2026-10-27" };
    const data = { boards: [board("a", "product"), board("b", "product")], sprints: [keyedOld, unkeyed] };
    const [a, b] = planningBoards(data, "2026-W43");
    expect(a.next).toBeNull();
    expect(a.ending.map((s) => s.id)).toEqual(["w42"]);
    expect(b.next?.id).toBe("hand");
  });
});

describe("planningWeeks", () => {
  it("lists the weekly boards' weeks newest first, once each, ignoring boards that plan by hand", () => {
    const data = {
      boards: [board("a", "product"), board("b", null)],
      sprints: [sprint("s1", "a", "2026-09-09", "closed", "2026-W37"), sprint("s2", "a", "2026-09-16", "active", "2026-W38"), sprint("s3", "a", "2026-09-01", "closed", null), sprint("x", "b", "2026-09-23", "active", "2026-W39")],
    };
    expect(planningWeeks(data, "2026-W38")).toEqual(["2026-W38", "2026-W37"]);
  });

  // W.202.1: one board's roadmap sprint (W46) became "(this week)" for everyone.
  it("lists no week after the one being planned, and always lists that one", () => {
    const data = {
      boards: [board("a", "product")],
      sprints: [sprint("s1", "a", "2026-10-14", "active", "2026-W42"), sprint("s2", "a", "2026-11-11", "active", "2026-W46")],
    };
    expect(planningWeeks(data, "2026-W43")).toEqual(["2026-W43", "2026-W42"]);
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

// W.202.2: the lock holds only until the sprint starts (sprint-lock.ts), and the
// page used to read locked_at alone, refusing all week what the server allowed.
describe("commitmentLocked", () => {
  const pb = (starts_on: string, locked_at: string | null) => ({ next: sprint("n", "a", starts_on, "active", null, locked_at) });

  it("holds from Finish planning until the sprint's first day, and not after", () => {
    expect(commitmentLocked(pb("2026-10-21", "2026-10-20T03:00:00Z"), "2026-10-20")).toBe(true);
    expect(commitmentLocked(pb("2026-10-21", "2026-10-20T03:00:00Z"), "2026-10-21")).toBe(false);
    expect(commitmentLocked(pb("2026-10-21", null), "2026-10-20")).toBe(false);
    expect(commitmentLocked({ next: null }, "2026-10-20")).toBe(false);
  });
});

// W.202.4: what each verb of the selection bar applies to. A selection may
// hold cards from several boards and from both lanes; each verb takes only the
// cards it can move, so a press never reaches a card it cannot apply to.
describe("planningMoves", () => {
  const cards = [
    { id: "o1", board_id: "a", columnId: "open" },
    { id: "o2", board_id: "b", columnId: "open" },
    { id: "n1", board_id: "a", columnId: "next" },
    { id: "n2", board_id: "b", columnId: "next" },
    { id: "d1", board_id: "a", columnId: "done" },
  ];

  it("commits Not done cards, takes Next sprint cards out, and closes both", () => {
    expect(planningMoves(["o1", "n1", "d1"], cards, () => true)).toEqual({ toNext: ["o1"], toOpen: ["n1"], toDone: ["o1", "n1"] });
  });

  it("leaves a board that cannot change its commitment out of next and back, but still closes its cards", () => {
    const moves = planningMoves(["o1", "o2", "n1", "n2"], cards, (boardId) => boardId === "a");
    expect(moves).toEqual({ toNext: ["o1"], toOpen: ["n1"], toDone: ["o1", "o2", "n1", "n2"] });
  });

  it("ignores ids that are no longer on screen", () => {
    expect(planningMoves(["gone"], cards, () => true)).toEqual({ toNext: [], toOpen: [], toDone: [] });
  });
});

// Review of W.202, (c)2: a board with no next sprint cannot take a commitment,
// so neither lane move is offered there, and the bar never enables a button
// whose press only ends in "has no next sprint yet".
describe("mayChangeCommitment", () => {
  it("needs a next sprint whose lock does not hold today", () => {
    expect(mayChangeCommitment({ next: sprint("n", "a", "2026-10-21") }, "2026-10-21")).toBe(true);
    expect(mayChangeCommitment({ next: null }, "2026-10-21")).toBe(false);
    expect(mayChangeCommitment({ next: sprint("n", "a", "2026-10-21", "active", null, "2026-10-20T03:00:00Z") }, "2026-10-20")).toBe(false);
  });

  // W.203: landInSprint refuses a closed sprint, so a closed next sprint is
  // no sprint to commit to; the panel and the bar must not offer the move.
  it("is false for a closed next sprint, which the server refuses to take a card", () => {
    expect(mayChangeCommitment({ next: sprint("n", "a", "2026-10-21", "closed") }, "2026-10-21")).toBe(false);
  });
});

// Review of W.202, (a)2: what may be ticked, and the run a Shift-click picks.
describe("the selection's rules", () => {
  const cards = [
    { id: "o1", columnId: "open" },
    { id: "n1", columnId: "next" },
    { id: "d1", columnId: "done" },
  ];

  it("lets Not done and Next sprint cards be ticked, never a finished one, and nothing on a week read back", () => {
    expect(pickableIds(cards, true)).toEqual(["o1", "n1"]);
    expect(pickableIds(cards, false)).toEqual([]);
    // Off screen is not pickable: a filter that hides a card takes it out of
    // the list useBoardSelection prunes against.
    expect(pickableIds(cards.slice(1), true)).toEqual(["n1"]);
  });

  it("picks the run from the last tick to this one, in lane order, either way round", () => {
    const lane = ["a", "b", "c", "d", "e"];
    expect(pickRun(lane, "b", "d")).toEqual(["b", "c", "d"]);
    expect(pickRun(lane, "d", "b")).toEqual(["b", "c", "d"]);
  });

  it("has no run when there is no last tick or it is in another lane, so the click is a plain toggle", () => {
    expect(pickRun(["a", "b"], null, "b")).toBeNull();
    expect(pickRun(["a", "b"], "x", "b")).toBeNull();
  });
});
