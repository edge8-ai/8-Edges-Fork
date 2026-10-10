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

  it("offers Overdue alone on a client-safe board", () => {
    expect(attentionOptions(data({ clientSafe: true }))).toEqual(["Overdue"]);
  });
});
