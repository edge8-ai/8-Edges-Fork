import { describe, expect, it } from "vitest";
import { countSprintCommits } from "./carry-history";
import { carryCandidates } from "./carry-candidates";

describe("how many weeks a card has been carried (W.52)", () => {
  it("counts distinct sprints, not moves", () => {
    const counts = countSprintCommits([
      { task_id: "t1", to_sprint_id: "s1" },
      { task_id: "t1", to_sprint_id: "s2" },
      { task_id: "t1", to_sprint_id: "s2" },
      { task_id: "t1", to_sprint_id: "s3" },
    ]);
    expect(counts.t1).toBe(3);
  });

  it("drops a card that has only ever been in one sprint", () => {
    expect(countSprintCommits([{ task_id: "t1", to_sprint_id: "s1" }])).toEqual({});
  });

  it("ignores a move out of a sprint and into none", () => {
    expect(countSprintCommits([{ task_id: "t1", to_sprint_id: null }, { task_id: "t1", to_sprint_id: "s1" }])).toEqual({});
  });

  it("asks only about open cards that are in a sprint", () => {
    const ids = carryCandidates([
      { id: "open-in-sprint", status: "open", sprint_id: "s1" },
      { id: "open-backlog", status: "open", sprint_id: null },
      { id: "done-in-sprint", status: "done", sprint_id: "s1" },
    ]);
    expect(ids).toEqual(["open-in-sprint"]);
  });
});
