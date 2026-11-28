import { describe, expect, it, vi } from "vitest";
import type { WorkboardData } from "@/entities/boards/lib/workboard";
import { filterControlDefs, type FilterControlSource } from "./workboard-filter-controls";

// W.121. The Attention picker offers only the kinds a board can answer: a
// client-safe read strips every card's blockers, so the portal and the client
// hub are never offered a Blocked that could only come back empty.

const data = (over: Partial<WorkboardData> = {}) =>
  ({ boards: [], clients: [], people: [], lanes: [], sprints: [], epics: [], ...over }) as unknown as WorkboardData;

const source: FilterControlSource = {
  single: null,
  activeSprints: [],
  defaultSprint: "all",
  weeks: [],
  clientFilter: [],
  setClientFilter: vi.fn(),
  boardOptions: [],
  boardFilter: [],
  setBoardFilter: vi.fn(),
  assigneeFilter: [],
  setAssigneeFilter: vi.fn(),
  laneFilter: [],
  setLaneFilter: vi.fn(),
  epicOptions: [],
  epicFilter: [],
  setEpicFilter: vi.fn(),
  sprintFilter: "all",
  setSprintFilter: vi.fn(),
  weekFilter: "all",
  setWeekFilter: vi.fn(),
  attentionFilter: [],
  setAttentionFilter: vi.fn(),
};

const attentionOptions = (d: WorkboardData) => {
  const def = filterControlDefs(d, source).find((x) => x.key === "attention");
  return def?.options.map((o) => o.label);
};

describe("the Attention picker", () => {
  it("offers Blocked and Overdue on the team's own boards", () => {
    expect(attentionOptions(data())).toEqual(["Blocked", "Overdue"]);
  });

  it("offers both on a client-safe board too: the client's board carries blockers since 2026-10-12", () => {
    expect(attentionOptions(data({ clientSafe: true }))).toEqual(["Blocked", "Overdue"]);
  });
});

// A.57: the sprint picker's "not filtering" value is the sprint the hook opened
// the board on (its current sprint), not the first active sprint in read order.
describe("the sprint picker", () => {
  it("reads the board's opening sprint as its default", () => {
    const sprints = [
      { id: "next", name: "Sprint 13", status: "active" },
      { id: "now", name: "Sprint 12", status: "active" },
    ];
    const single = { ...source, single: { id: "b1" }, activeSprints: sprints, defaultSprint: "now" };
    const def = filterControlDefs(data({ sprints } as unknown as Partial<WorkboardData>), single).find((x) => x.key === "sprint");
    expect(def?.kind === "one" ? def.defaultValue : null).toBe("now");
  });
});
