import { describe, expect, it } from "vitest";
import { goalDirection, measureOf, specificTarget, targetSuffix } from "./goal-measure";

// One way to say a goal's number, for every screen that says it (K.78). A goal
// goes up by default; a goal whose target sits below where it started is a cut,
// and "3 of 2 hours" says nothing about a cut.

describe("goalDirection", () => {
  it("goes up by default, and down only when the target sits below the start", () => {
    expect(goalDirection(0, 200)).toBe("up");
    expect(goalDirection(null, 200)).toBe("up");
    expect(goalDirection(3, null)).toBe("up");
    expect(goalDirection(3, 2)).toBe("down");
  });
});

describe("measureOf", () => {
  it("reads a goal going up as a share of the target", () => {
    expect(measureOf({ current: 119, target: 200, unit: "students", direction: "up" })).toBe("119 of 200 students");
    expect(measureOf({ current: 4.2, target: 5, unit: null, direction: "up" })).toBe("4.2 of 5");
  });
  it("reads a cut as heading down to the target", () => {
    expect(measureOf({ current: 3, target: 2, unit: "hours", direction: "down" })).toBe("3 hours, down to 2");
    expect(measureOf({ current: 3, target: 2, unit: null, direction: "down" })).toBe("3, down to 2");
  });
  it("says nothing without both numbers", () => {
    expect(measureOf({ current: null, target: 2, unit: "hours", direction: "down" })).toBeNull();
    expect(measureOf({ current: 3, target: null, unit: null, direction: "up" })).toBeNull();
  });
});

describe("targetSuffix", () => {
  // The small text beside the display-size number: the number plus this suffix
  // must read as measureOf does.
  it("completes the display number in both directions", () => {
    expect(targetSuffix({ target: 200, unit: "students", direction: "up" })).toBe("of 200 students");
    expect(targetSuffix({ target: 2, unit: "hours", direction: "down" })).toBe("hours, down to 2");
    expect(targetSuffix({ target: 2, unit: null, direction: "down" })).toBe("down to 2");
    expect(targetSuffix({ target: null, unit: "hours", direction: "up" })).toBeNull();
  });
});

describe("specificTarget", () => {
  it("names the target and where it started from, in its direction", () => {
    expect(specificTarget({ start: 4, target: 5, unit: "rating" })).toBe("target 5 rating, up from 4");
    expect(specificTarget({ start: 3, target: 2, unit: "hours" })).toBe("target 2 hours, down from 3");
  });
  it("leaves the start out when there is none, or it is the target", () => {
    expect(specificTarget({ start: null, target: 5, unit: "rating" })).toBe("target 5 rating");
    expect(specificTarget({ start: 5, target: 5, unit: null })).toBe("target 5");
    expect(specificTarget({ start: 4, target: null, unit: null })).toBeNull();
  });
});
