import { describe, expect, it, vi } from "vitest";
import { filterParts, type FilterControls, type FilterNames } from "./workboard-filter-parts";

// What the sentence promises (W.46): every active filter appears in it, each
// part removes only itself, and a board that nothing is narrowing has no
// sentence at all.

const names: FilterNames = {
  clients: [{ id: "c1", name: "Acme" }],
  boards: [{ id: "b1", name: "Acme · Ops" }],
  people: [{ id: "p1", name: "Dave" }],
  lanes: [{ id: "l1", name: "Doing" }],
  sprints: [{ id: "s1", name: "Sprint 12" }],
  epics: [
    { id: "e1", name: "Workboard" },
    { id: "e2", name: "Ops · Workboard" },
  ],
  defaultSprint: "s1",
};

const controls = (over: Partial<FilterControls> = {}): FilterControls => ({
  clientFilter: [],
  setClientFilter: vi.fn(),
  boardFilter: [],
  setBoardFilter: vi.fn(),
  assigneeFilter: [],
  setAssigneeFilter: vi.fn(),
  laneFilter: [],
  setLaneFilter: vi.fn(),
  epicFilter: [],
  setEpicFilter: vi.fn(),
  sprintFilter: "s1",
  setSprintFilter: vi.fn(),
  weekFilter: "all",
  setWeekFilter: vi.fn(),
  undatedFilter: false,
  setUndatedFilter: vi.fn(),
  attentionFilter: [],
  setAttentionFilter: vi.fn(),
  search: "",
  setSearch: vi.fn(),
  ...over,
});

describe("filterParts", () => {
  it("says nothing about a board nothing is narrowing", () => {
    expect(filterParts(controls(), names)).toEqual([]);
  });

  it("names every active filter, in the order the board reads", () => {
    const f = controls({
      clientFilter: ["c1", "internal"],
      boardFilter: ["b1"],
      assigneeFilter: ["p1", "unassigned"],
      laneFilter: ["l1"],
      epicFilter: ["e1", "none"],
      sprintFilter: "backlog",
      search: " invoice ",
    });
    expect(filterParts(f, names).map((p) => p.label)).toEqual([
      "Acme",
      "Internal",
      "Acme · Ops",
      "Dave",
      "Unassigned",
      "Doing",
      "Workboard",
      "No epic",
      "Backlog",
      "“invoice”",
    ]);
  });

  it("leaves the board's own opening sprint out: that is not a filter anyone chose", () => {
    expect(filterParts(controls({ sprintFilter: "s1" }), names)).toEqual([]);
    expect(filterParts(controls({ sprintFilter: "all" }), names).map((p) => p.label)).toEqual(["All sprints"]);
  });

  it("removes only its own value from a filter that holds several", () => {
    const f = controls({ clientFilter: ["c1", "internal"] });
    filterParts(f, names)[0].remove();
    expect(f.setClientFilter).toHaveBeenCalledWith(["internal"]);
  });

  it("drops one epic and leaves the others filtering, like the four beside it", () => {
    const f = controls({ epicFilter: ["e1", "e2", "none"] });
    const parts = filterParts(f, names);
    expect(parts.map((p) => p.label)).toEqual(["Workboard", "Ops · Workboard", "No epic"]);
    parts[1].remove();
    expect(f.setEpicFilter).toHaveBeenCalledWith(["e1", "none"]);
  });

  it("returns a single-valued filter to its default", () => {
    const f = controls({ sprintFilter: "all", weekFilter: "2026-W38", search: "x" });
    const parts = filterParts(f, names);
    for (const p of parts) p.remove();
    expect(f.setSprintFilter).toHaveBeenCalledWith("s1");
    expect(f.setWeekFilter).toHaveBeenCalledWith("all");
    expect(f.setSearch).toHaveBeenCalledWith("");
  });

  // W.105. The Schedule can turn this one on without a picker, so the sentence
  // is the only place it is named and the only way back out of it.
  it("says the undated filter in words, and dismissing it turns it off", () => {
    const f = controls({ undatedFilter: true });
    const parts = filterParts(f, names);
    expect(parts.map((p) => p.label)).toEqual(["No due date"]);
    parts[0].remove();
    expect(f.setUndatedFilter).toHaveBeenCalledWith(false);
  });

  it("names an id it no longer recognises rather than showing a bare uuid", () => {
    expect(filterParts(controls({ laneFilter: ["gone"] }), names)[0].label).toBe("Unknown status");
  });
});

describe("the attention parts (W.121)", () => {
  it("names each kind chosen, and each part removes only itself", () => {
    const setAttentionFilter = vi.fn();
    const parts = filterParts(controls({ attentionFilter: ["blocked", "overdue"], setAttentionFilter }), names);
    expect(parts.map((p) => p.label)).toEqual(["Blocked", "Overdue"]);
    parts[0].remove();
    expect(setAttentionFilter).toHaveBeenCalledWith(["overdue"]);
  });
});
