import { describe, expect, it } from "vitest";
import { quarterStart, themeLine } from "./innovation-weekly";

describe("innovation weekly", () => {
  it("finds the quarter's first day", () => {
    expect(quarterStart("2026-11-18")).toBe("2026-10-01");
    expect(quarterStart("2026-01-05")).toBe("2026-01-01");
    expect(quarterStart("2026-06-30")).toBe("2026-04-01");
  });

  it("describes a theme by size, people and newest date, never by id", () => {
    const ideas = new Map([
      ["a", { id: "a", title: "One", person_id: "p1", status: "new", created_at: "2026-11-06T00:00:00Z", people: null }],
      ["b", { id: "b", title: "Two", person_id: "p2", status: "new", created_at: "2026-10-30T00:00:00Z", people: null }],
    ]);
    const line = themeLine({ kind: "build", title: "One gate", gist: "Safe data access.", ideaIds: ["a", "b"], relatedIds: [], repeats: [] }, ideas);
    expect(line).toBe("One gate | 2 ideas | 2 people | newest 2026-11-06 | Safe data access.");
  });
});
