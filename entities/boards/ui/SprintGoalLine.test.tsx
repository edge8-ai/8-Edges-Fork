import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SprintGoalLine } from "./SprintGoalLine";
import type { SprintRow } from "@/entities/boards/lib/types";

// W.51: the goal is on the board when one sprint is the filter, and nowhere
// else. The three silences matter as much as the line — an empty box says the
// same thing as nothing and takes a line to do it.

const sprints = [
  { id: "s1", name: "Sprint 12", goal: "Ship the invoice run" },
  { id: "s2", name: "Sprint 13", goal: null },
  { id: "s3", name: "Sprint 14", goal: "   " },
] as unknown as SprintRow[];

const render = (sprintFilter: string) => renderToStaticMarkup(<SprintGoalLine sprintFilter={sprintFilter} sprints={sprints} />);

describe("the sprint goal on the board", () => {
  it("shows the chosen sprint's goal, named", () => {
    const html = render("s1");
    expect(html).toContain("Ship the invoice run");
    expect(html).toContain("Sprint 12");
  });

  it("shows nothing for a sprint with no goal, and nothing for a blank one", () => {
    expect(render("s2")).toBe("");
    expect(render("s3")).toBe("");
  });

  it("shows nothing for All sprints or for the backlog", () => {
    expect(render("all")).toBe("");
    expect(render("backlog")).toBe("");
  });
});
