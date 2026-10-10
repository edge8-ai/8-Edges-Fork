import { describe, expect, it } from "vitest";
import type { WorkboardData } from "@/entities/boards/lib/workboard";
import { workboardHeadSummary } from "./workboard-head-summary";

// The Workboard page's one quiet line (W.92.5), and the week in it (W.176).
// Invented board names: the public fork receives test files too.

const TODAY = "2026-10-07"; // a Wednesday in 2026-W41

const sprint = (week: string | null, starts_on: string | null, status = "active") => ({ id: `${week}-${starts_on}`, week, starts_on, status });
const data = (sprints: ReturnType<typeof sprint>[]): WorkboardData =>
  ({ cards: [{}, {}, {}], boards: [{}, {}], sprints }) as unknown as WorkboardData;

describe("workboardHeadSummary", () => {
  it("counts the cards and the boards", () => {
    expect(workboardHeadSummary(data([]), TODAY)).toBe("3 cards · 2 boards");
  });

  // 2026-10-07: 43 sprints were active, a client board had planned ahead to a
  // W45 go-live, and the header said W45 in week 41.
  it("names the week of the sprint we are in, not a later one planned ahead", () => {
    const sprints = [sprint("2026-W45", "2026-11-04"), sprint("2026-W42", "2026-10-14"), sprint("2026-W41", "2026-10-07"), sprint("2026-W40", "2026-09-30")];
    expect(workboardHeadSummary(data(sprints), TODAY)).toBe("3 cards · 2 boards · 2026-W41");
  });

  it("does not name a finished sprint's week while a newer one has begun", () => {
    expect(workboardHeadSummary(data([sprint("2026-W35", "2026-08-24"), sprint("2026-W41", "2026-10-07")]), TODAY)).toContain("2026-W41");
  });

  it("names no week when no active sprint has begun, or none carries one", () => {
    expect(workboardHeadSummary(data([sprint("2026-W42", "2026-10-14")]), TODAY)).toBe("3 cards · 2 boards");
    expect(workboardHeadSummary(data([sprint(null, "2026-10-07")]), TODAY)).toBe("3 cards · 2 boards");
    expect(workboardHeadSummary(data([sprint("2026-W41", "2026-10-07", "closed")]), TODAY)).toBe("3 cards · 2 boards");
  });
});
