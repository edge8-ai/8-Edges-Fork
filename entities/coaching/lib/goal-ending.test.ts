import { describe, expect, it } from "vitest";
import { endedLabel, goalHasEnded, shortDay } from "./goal-ending";

// K.83: an active goal whose date has passed asks for an ending. The rule is the
// whole feature, so its edges are the test: the due day itself is not past,
// and a goal that already has an ending, or never had a date, never asks.
describe("goalHasEnded", () => {
  const today = "2026-10-11";

  it("is ended the day after its due date, not on it", () => {
    expect(goalHasEnded({ status: "active", dueDate: "2026-10-10" }, today)).toBe(true);
    expect(goalHasEnded({ status: "active", dueDate: "2026-10-11" }, today)).toBe(false);
    expect(goalHasEnded({ status: "active", dueDate: "2026-10-31" }, today)).toBe(false);
  });

  it("never asks a goal with no date, or one that already has an ending", () => {
    expect(goalHasEnded({ status: "active", dueDate: null }, today)).toBe(false);
    for (const status of ["achieved", "missed", "dropped", "draft"]) {
      expect(goalHasEnded({ status, dueDate: "2026-09-30" }, today)).toBe(false);
    }
  });
});

describe("the ended label", () => {
  it("names the calendar day the goal ended, without a time zone moving it", () => {
    expect(shortDay("2026-09-30")).toBe("30 Sep");
    expect(shortDay("2026-03-01")).toBe("1 Mar");
    expect(endedLabel("2026-09-30")).toBe("Ended 30 Sep · did it land?");
  });
});
