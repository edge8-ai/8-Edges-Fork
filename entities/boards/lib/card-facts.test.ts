import { describe, expect, it } from "vitest";
import { cardFacts, clientLabel, countOpenBlockers, isOverdue, placeLabel, subtaskProgress, type FactCard } from "./card-facts";
import { splitCardChildren } from "./workboard-children";

// A.29.1. What a card shows is decided once, here: the card, the list row,
// the calendar day, the My Week row and the drawer read these facts rather
// than each working them out. One table per fact, so a changed rule shows up
// as one changed row.

const TODAY = "2026-09-23";
const NOW = new Date("2026-09-23T05:00:00Z");

const card = (over: Partial<FactCard> = {}): FactCard => ({
  status: "open",
  due_date: null,
  priority: "p2",
  assignee_id: null,
  blockers: [],
  subtasks: [],
  last_moved_at: "2026-09-22T05:00:00Z",
  ...over,
});
const facts = (over: Partial<FactCard> = {}, ctx: Partial<Parameters<typeof cardFacts>[1]> = {}) =>
  cardFacts(card(over), { today: TODAY, now: NOW, ...ctx });

const clientBoard = { name: "Ledger Lab", client_name: "Acme" };
const internalBoard = { name: "8 Edges", client_name: null };

describe("overdue: open, due strictly before today's business date", () => {
  it.each([
    ["due yesterday", { due_date: "2026-09-22" }, true],
    ["due today, not until tomorrow", { due_date: "2026-09-23" }, false],
    ["due tomorrow", { due_date: "2026-09-24" }, false],
    ["done, however late", { due_date: "2026-01-01", status: "done" }, false],
    ["not doing, however late: a decision, not a debt", { due_date: "2026-01-01", status: "not_doing" }, false],
    ["no due date: undated, never overdue", { due_date: null }, false],
    ["a timestamp-shaped date reads its day", { due_date: "2026-09-22T23:30:00Z" }, true],
  ] as const)("%s", (_label, over, expected) => {
    expect(facts(over).overdue).toBe(expected);
    expect(isOverdue(card(over), TODAY)).toBe(expected);
  });
});

describe("clientLabel: whose work it is", () => {
  it.each([
    ["a client's board names the client", clientBoard, "Acme"],
    ["an internal board reads Internal", internalBoard, "Internal"],
    ["no board at all reads Internal, as the card always has", undefined, "Internal"],
  ] as const)("%s", (_label, board, expected) => {
    expect(clientLabel(board)).toBe(expected);
    expect(facts({}, { board }).clientLabel).toBe(expected);
  });
});

describe("placeLabel: where the card lives, for cross-board lists", () => {
  it.each([
    ["client and board", clientBoard, "Acme · Ledger Lab"],
    ["an internal board is its name alone", internalBoard, "8 Edges"],
    ["a board named after its client is not said twice", { name: "Acme", client_name: "Acme" }, "Acme"],
    ["no board, no place", undefined, ""],
  ] as const)("%s", (_label, board, expected) => {
    expect(placeLabel(board)).toBe(expected);
  });
});

describe("the reader and the work", () => {
  it("is high priority only at p1", () => {
    expect(facts({ priority: "p1" }).highPriority).toBe(true);
    expect(facts({ priority: "p2" }).highPriority).toBe(false);
  });

  it.each([
    ["the viewer holds it", { assignee_id: "me" }, "me", true],
    ["somebody else holds it", { assignee_id: "you" }, "me", false],
    ["nobody is viewing", { assignee_id: "me" }, null, false],
    ["nobody holds it", { assignee_id: null }, "me", false],
  ] as const)("mine: %s", (_label, over, viewerPersonId, expected) => {
    expect(facts(over, { viewerPersonId }).mine).toBe(expected);
  });

  it("counts only the blockers not yet resolved", () => {
    const blockers = [{ resolved: true }, { resolved: false }, { resolved: false }];
    expect(facts({ blockers }).openBlockers).toBe(2);
    expect(countOpenBlockers({ blockers })).toBe(2);
    expect(facts().openBlockers).toBe(0);
  });

  it("reads subtask progress as done of total", () => {
    expect(facts({ subtasks: [{ done: true }, { done: false }, { done: true }] }).subtasks).toEqual({ done: 2, total: 3 });
    expect(facts().subtasks).toEqual({ done: 0, total: 0 });
  });
});

describe("aging: long in one column, and never once done", () => {
  it.each([
    ["six days is not yet aging", "2026-09-17T05:00:00Z", "open", 6, false],
    ["seven days is the threshold", "2026-09-16T05:00:00Z", "open", 7, true],
    ["a done card never ages", "2026-08-01T05:00:00Z", "done", 53, false],
  ] as const)("%s", (_label, last_moved_at, status, days, aging) => {
    expect(facts({ last_moved_at, status }).aging).toEqual({ days, aging });
  });
});

// W.139: a subtask closed with its card in Not Doing counted as "not done",
// so the card read 0/2 for as long as it existed.
describe("subtask progress and Not Doing", () => {
  it("leaves a set-aside subtask out of both figures", () => {
    expect(subtaskProgress([{ done: true }, { done: false }, { done: false, setAside: true }])).toEqual({ done: 1, total: 2 });
  });

  it("marks a child the board read as not_doing set aside, and one it read as open not", () => {
    const child = (id: string, status: string) =>
      ({ id, parent_task_id: "p", title: id, status, human_tokens: null, assignee_id: null, metadata: {} }) as never;
    const { subtasksByParent } = splitCardChildren([child("a", "not_doing"), child("b", "open"), child("c", "done")]);
    expect(subtasksByParent.get("p")?.map((s) => [s.id, s.done, s.setAside])).toEqual([["a", false, true], ["b", false, false], ["c", true, false]]);
  });
});

