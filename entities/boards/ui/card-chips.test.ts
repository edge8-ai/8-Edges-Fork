import { describe, expect, it } from "vitest";
import { cardRef, chipDate, drawerEyebrow, firstName, sprintChip } from "./card-chips";

// W.159: the drawer's pinned line and field chips read exactly as the approved
// canvas does ("Sat 10 Oct", initials and a first name, "Week 41 · 6–10 Oct this week",
// "8 Edges · W.181"). Pure, so the wording is pinned without a DOM.

describe("chipDate", () => {
  it("reads a due date as the canvas does: weekday, day, short month", () => {
    // 10 Oct 2026 is a Saturday; the canvas's "Fri 10 Oct" was a placeholder.
    expect(chipDate("2026-10-10")).toBe("Sat 10 Oct");
    expect(chipDate("2026-09-29")).toBe("Tue 29 Sep");
  });

  it("is the same date wherever it renders, so server and browser agree", () => {
    expect(chipDate("2026-01-01")).toBe("Thu 1 Jan");
  });
});

describe("firstName", () => {
  it("shows a person by their first name beside their initials", () => {
    expect(firstName("Ada Rivers")).toBe("Ada");
    expect(firstName("  Ada  ")).toBe("Ada");
  });
});

describe("sprintChip", () => {
  const sprint = { name: "Sprint 6 - Cron Harness", starts_on: "2026-10-07", ends_on: "2026-10-13" };

  it("names the sprint and its days, and says when it is this week", () => {
    expect(sprintChip(sprint, "2026-10-08")).toEqual({ name: "Sprint 6 - Cron Harness", range: "7–13 Oct", when: "this week" });
  });

  it("says next week before it starts, and nothing once it is further off or over", () => {
    expect(sprintChip(sprint, "2026-10-03").when).toBe("next week");
    expect(sprintChip(sprint, "2026-09-20").when).toBeNull();
    expect(sprintChip(sprint, "2026-10-20").when).toBeNull();
  });

  it("spans months when the sprint does", () => {
    expect(sprintChip({ name: "S", starts_on: "2026-09-29", ends_on: "2026-10-05" }, "2026-10-01").range).toBe("29 Sep – 5 Oct");
  });

  it("reads a sprint with no dates as its name alone", () => {
    expect(sprintChip({ name: "Backlog sweep", starts_on: null, ends_on: null }, "2026-10-01")).toEqual({ name: "Backlog sweep", range: null, when: null });
  });
});

describe("cardRef and drawerEyebrow", () => {
  it("reads the plan reference off a card's title, tag or not", () => {
    expect(cardRef("W.181 Redesign the drawer")).toBe("W.181");
    expect(cardRef("[HUMAN] W.154 Deliverables table")).toBe("W.154");
    expect(cardRef("W.70.3 Stage 1")).toBe("W.70.3");
    expect(cardRef("LinkedIn carousel")).toBeNull();
  });

  it("names the board, or says it is a new card", () => {
    expect(drawerEyebrow("Revenue", "LinkedIn carousel", false)).toBe("Revenue");
    expect(drawerEyebrow("8 Edges", "", true)).toBe("8 Edges · New card");
    expect(drawerEyebrow(null, "", true)).toBe("New card");
  });

  // Bug hunt U4: "8 Edges · W.181" sat over a title that already reads
  // "W.181 Redesign", so the reference was said twice.
  it("does not repeat the reference the title already starts with", () => {
    expect(drawerEyebrow("8 Edges", "W.181 Redesign", false)).toBe("8 Edges");
    expect(drawerEyebrow("8 Edges", "[HUMAN] W.154 Deliverables table", false)).toBe("8 Edges");
    // A new card still says so, whatever its title already holds.
    expect(drawerEyebrow("8 Edges", "W.181 Redesign", true)).toBe("8 Edges · New card");
  });

  it("falls back to the reference only when there is no board name to show", () => {
    expect(drawerEyebrow(null, "W.181 Redesign", false)).toBe("W.181");
    expect(drawerEyebrow(null, "LinkedIn carousel", false)).toBe("");
  });
});
