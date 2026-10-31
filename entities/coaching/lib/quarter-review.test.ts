import { describe, expect, it } from "vitest";
import { buildQuarterReview, quarterBounds, quartersWithMeetings } from "./quarter-review";

describe("quarterBounds", () => {
  it("covers each quarter of the year", () => {
    expect(quarterBounds("2026-Q1")).toEqual({ from: "2026-01-01", to: "2026-03-31" });
    expect(quarterBounds("2026-Q2")).toEqual({ from: "2026-04-01", to: "2026-06-30" });
    expect(quarterBounds("2026-Q3")).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(quarterBounds("2026-Q4")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
  });

  it("ends every quarter on the right day of its last month", () => {
    expect(quarterBounds("2027-Q1")?.to).toBe("2027-03-31");
    expect(quarterBounds("2028-Q2")?.to).toBe("2028-06-30");
  });

  it("refuses anything that is not a quarter label", () => {
    expect(quarterBounds("2026-Q5")).toBeNull();
    expect(quarterBounds("2026-q3")).toBeNull();
    expect(quarterBounds("../../etc")).toBeNull();
  });
});

describe("quartersWithMeetings", () => {
  it("lists each quarter once, newest first", () => {
    expect(
      quartersWithMeetings([{ heldOn: "2026-09-02" }, { heldOn: "2026-07-30" }, { heldOn: "2026-04-01" }]),
    ).toEqual(["2026-Q3", "2026-Q2"]);
  });
});

const meetings = [
  { id: "a", heldOn: "2026-07-10", sharedSummaryMarkdown: "## Recap\nWe talked about the goal. And more.", made: 3, kept: 3 },
  { id: "b", heldOn: "2026-09-29", sharedSummaryMarkdown: null, made: 2, kept: 0 },
  { id: "c", heldOn: "2026-10-01", sharedSummaryMarkdown: "Next quarter.", made: 1, kept: 1 },
];

describe("buildQuarterReview", () => {
  it("keeps only what falls inside the quarter, oldest first", () => {
    const review = buildQuarterReview({
      quarter: "2026-Q3",
      goals: [
        { title: "Ship the portal", status: "achieved", quarterLabel: "2026-Q3", descriptionMarkdown: "why" },
        { title: "Next one", status: "active", quarterLabel: "2026-Q4", descriptionMarkdown: null },
        { title: "Unfiled", status: "active", quarterLabel: null, descriptionMarkdown: null },
      ],
      meetings,
      notes: [
        { on: "2026-08-04", body: "A client said yes" },
        { on: "2026-11-02", body: "Later" },
      ],
    });
    expect(review).not.toBeNull();
    expect(review?.heading).toBe("Q3 2026");
    expect(review?.goals.map((g) => g.title)).toEqual(["Ship the portal"]);
    expect(review?.goals[0]?.ending).toBe("Reached.");
    expect(review?.meetings.map((m) => m.id)).toEqual(["a", "b"]);
    expect(review?.meetings[0]?.recapLine).toBe("Recap We talked about the goal.");
    expect(review?.meetings[1]?.recapLine).toBe("");
    expect(review?.notes.map((n) => n.body)).toEqual(["A client said yes"]);
    expect(review?.kept).toBe(3);
    expect(review?.made).toBe(5);
    expect(review?.empty).toBe(false);
  });

  it("drops a meeting with nothing committed from the chart", () => {
    const review = buildQuarterReview({
      quarter: "2026-Q3",
      goals: [],
      meetings: [{ id: "d", heldOn: "2026-08-01", sharedSummaryMarkdown: null, made: 0, kept: 0 }],
      notes: [],
    });
    expect(review?.bars).toEqual([]);
    expect(review?.meetings).toHaveLength(1);
    expect(review?.empty).toBe(false);
  });

  it("scales each bar against its own meeting", () => {
    const review = buildQuarterReview({ quarter: "2026-Q3", goals: [], meetings, notes: [] });
    expect(review?.bars.map((b) => b.ratio)).toEqual([1, 0]);
  });

  it("reports an empty quarter rather than failing", () => {
    const review = buildQuarterReview({ quarter: "2025-Q1", goals: [], meetings, notes: [] });
    expect(review?.empty).toBe(true);
    expect(review?.meetings).toEqual([]);
  });

  it("returns null for a quarter that is not one", () => {
    expect(buildQuarterReview({ quarter: "nope", goals: [], meetings: [], notes: [] })).toBeNull();
  });
});
