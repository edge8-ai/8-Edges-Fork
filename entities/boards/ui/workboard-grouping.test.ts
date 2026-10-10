import { describe, expect, it, vi } from "vitest";
import type { TaskPriority } from "@/entities/boards/lib/types";
import {
  GROUPING_LABEL,
  INTERNAL,
  NO_GROUP,
  UNASSIGNED,
  availableGroupings,
  cardGroupId,
  groupColumns,
  groupDropField,
  groupDropRefusal,
  type GroupableCard,
  type GroupingVocabulary,
} from "./workboard-grouping";
import { groupDropWrite } from "./workboard-group-drop";

// What grouping promises (W.25): five groupings that all render, each drop
// writing the field its column stands for, and a drop that cannot be honoured
// refusing in words rather than reverting the card.

const vocab = (over: Partial<GroupingVocabulary> = {}): GroupingVocabulary => ({
  lanes: [
    { id: "To do", name: "To do", isDone: false, isNotDoing: false, wipLimit: null },
    { id: "Doing", name: "Doing", isDone: false, isNotDoing: false, wipLimit: null },
    { id: "Done", name: "Done", isDone: true, isNotDoing: false, wipLimit: null },
  ],
  epics: [
    { id: "e1", board_id: "b1", name: "Commerce & Billing", description: null, color: "epic-colour", status: "active", sort_order: 0 },
    { id: "e2", board_id: "b1", name: "Never used", description: null, color: null, status: "active", sort_order: 1 },
  ],
  sprints: [{ id: "s1", board_id: "b1", name: "W38", goal: null, starts_on: null, ends_on: null, status: "active", sort_order: 0, meeting_id: null, focus_improvement: null, going_well: null, meeting_summary: null, week: "2026-W38", locked_at: null }],
  clients: [{ id: "c1", name: "Acme" }],
  people: [{ id: "p1", name: "Dave" }],
  boardClient: new Map([
    ["b1", "c1"],
    ["b2", null],
  ]),
  ...over,
});

const card = (over: Partial<GroupableCard> = {}): GroupableCard => ({
  id: "t1",
  columnId: "Doing",
  board_id: "b1",
  epic_id: "e1",
  sprint_id: "s1",
  assignee_id: "p1",
  priority: "p2" as TaskPriority,
  ...over,
});

describe("cardGroupId", () => {
  it("puts a card in the column its grouping names", () => {
    const v = vocab();
    const c = card();
    expect(cardGroupId(c, "lane", v)).toBe("Doing");
    expect(cardGroupId(c, "epic", v)).toBe("e1");
    expect(cardGroupId(c, "sprint", v)).toBe("s1");
    expect(cardGroupId(c, "assignee", v)).toBe("p1");
    expect(cardGroupId(c, "priority", v)).toBe("p2");
    // A card's client is its BOARD's client, which is why it cannot be dropped.
    expect(cardGroupId(c, "client", v)).toBe("c1");
  });

  it("falls into the synthetic column when the field is empty", () => {
    const v = vocab();
    expect(cardGroupId(card({ epic_id: null }), "epic", v)).toBe(NO_GROUP);
    expect(cardGroupId(card({ sprint_id: null }), "sprint", v)).toBe(NO_GROUP);
    expect(cardGroupId(card({ assignee_id: null }), "assignee", v)).toBe(UNASSIGNED);
    expect(cardGroupId(card({ board_id: "b2" }), "client", v)).toBe(INTERNAL);
  });
});

describe("groupColumns", () => {
  it("renders every lane and every priority, empty or not", () => {
    const v = vocab();
    expect(groupColumns("lane", [], v).map((c) => c.id)).toEqual(["To do", "Doing", "Done"]);
    expect(groupColumns("priority", [], v).map((c) => c.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("drops empty groups everywhere else, so 23 epics are not 21 empty columns", () => {
    const v = vocab();
    const cards = [card(), card({ id: "t2", epic_id: null })];
    expect(groupColumns("epic", cards, v).map((c) => c.id)).toEqual(["e1", NO_GROUP]);
    expect(groupColumns("assignee", cards, v).map((c) => c.id)).toEqual(["p1"]);
    expect(groupColumns("client", cards, v).map((c) => c.id)).toEqual(["c1"]);
  });

  it("gives an epic column the epic's own colour as its accent", () => {
    expect(groupColumns("epic", [card()], vocab())[0]?.accent).toBe("epic-colour");
  });
});

describe("availableGroupings", () => {
  it("offers epic only on a single board, because epics are board-scoped (W.41)", () => {
    expect(availableGroupings(vocab(), true)).toContain("epic");
    expect(availableGroupings(vocab(), false)).not.toContain("epic");
  });

  it("does not offer a grouping with nothing to group by", () => {
    const one = vocab({ epics: [], sprints: [], boardClient: new Map([["b1", "c1"]]) });
    expect(availableGroupings(one, true)).toEqual(["lane", "priority", "assignee"]);
  });

  it("counts internal boards as a client, so a mixed scope can group by client", () => {
    expect(availableGroupings(vocab(), false)).toContain("client");
  });

  it("labels every grouping", () => {
    for (const g of availableGroupings(vocab(), true)) expect(GROUPING_LABEL[g]).toBeTruthy();
  });
});

describe("a drop into a grouped column", () => {
  const actions = () => ({
    setEpic: vi.fn(async () => ({ ok: true }) as const),
    setSprint: vi.fn(async () => ({ ok: true }) as const),
    update: vi.fn(async () => ({ ok: true }) as const),
  });

  it("writes the epic, and only the epic", async () => {
    const a = actions();
    await groupDropWrite("epic", "t1", "e2", "acme", a)!();
    expect(a.setEpic).toHaveBeenCalledWith("t1", "e2", "acme");
    expect(a.setSprint).not.toHaveBeenCalled();
    expect(a.update).not.toHaveBeenCalled();
  });

  it("writes the sprint", async () => {
    const a = actions();
    await groupDropWrite("sprint", "t1", "s1", "acme", a)!();
    expect(a.setSprint).toHaveBeenCalledWith("t1", "s1", "acme");
  });

  it("writes the assignee", async () => {
    const a = actions();
    await groupDropWrite("assignee", "t1", "p1", "acme", a)!();
    expect(a.update).toHaveBeenCalledWith("t1", { assigneeId: "p1" }, "acme");
  });

  it("writes the priority", async () => {
    const a = actions();
    await groupDropWrite("priority", "t1", "p1", "acme", a)!();
    expect(a.update).toHaveBeenCalledWith("t1", { priority: "p1" }, "acme");
  });

  it("clears the field when the card lands in the synthetic column", async () => {
    const a = actions();
    await groupDropWrite("epic", "t1", NO_GROUP, "acme", a)!();
    await groupDropWrite("sprint", "t1", NO_GROUP, "acme", a)!();
    await groupDropWrite("assignee", "t1", UNASSIGNED, "acme", a)!();
    expect(a.setEpic).toHaveBeenCalledWith("t1", null, "acme");
    expect(a.setSprint).toHaveBeenCalledWith("t1", null, "acme");
    expect(a.update).toHaveBeenCalledWith("t1", { assigneeId: null }, "acme");
  });

  it("refuses the client grouping in words rather than writing anything", () => {
    expect(groupDropField("client")).toBeNull();
    expect(groupDropWrite("client", "t1", "c1", "acme", actions())).toBeNull();
    expect(groupDropRefusal("client")).toMatch(/comes from its board/);
  });

  it("leaves the lanes to the board's own cross-lane move", () => {
    expect(groupDropWrite("lane", "t1", "Doing", "acme", actions())).toBeNull();
    expect(groupDropRefusal("lane")).toBeNull();
  });
});
