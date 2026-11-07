import { describe, expect, it } from "vitest";
import { goalMoment } from "./goal-moment";

describe("goalMoment", () => {
  it("celebrates a move with the share and what is left", () => {
    // Under the half line, so this is the plain move, not the milestone: the
    // K.41 line still reads the same wherever the halfway rule does not fire.
    const m = goalMoment({ before: 19, after: 79, target: 200, unit: "students" });
    expect(m.tone).toBe("up");
    expect(m.headline).toBe("19 → 79 students");
    expect(m.detail).toBe("40% of the way. 121 students to go.");
  });
  it("says Halfway only on the bump that crosses the line", () => {
    const crossing = goalMoment({ before: 90, after: 110, target: 200, unit: "students" });
    expect(crossing.tone).toBe("halfway");
    expect(crossing.headline).toBe("Halfway. 110 of 200 students.");
    expect(goalMoment({ before: 110, after: 130, target: 200, unit: "students" }).tone).toBe("up");
  });
  it("keeps landing ahead of halfway when one bump does both", () => {
    // A goal with no measure has no half to cross, and a bump that goes
    // straight past the target is a landing, not a halfway.
    expect(goalMoment({ before: 10, after: 40, target: null, unit: null }).tone).toBe("up");
    expect(goalMoment({ before: 10, after: 200, target: 200, unit: null }).tone).toBe("landed");
  });
  it("marks the goal landed at or past the target", () => {
    expect(goalMoment({ before: 190, after: 200, target: 200, unit: null }).tone).toBe("landed");
  });
  it("measures the share from where the goal started, as the bar does", () => {
    // Production, 2026-10-06: a goal from 4 to 5 stars bumped to 4.2 said "84%
    // of the way" (4.2 / 5) while its bar stood at 20%. The share is the
    // distance travelled from the start, so the line and the bar agree.
    const m = goalMoment({ before: 4, after: 4.2, start: 4, target: 5, unit: "rating" });
    expect(m.detail).toBe("20% of the way. 0.8 rating to go.");
  });
  it("never prints floating-point noise in what is left", () => {
    // The same bump printed "0.7999999999999998 rating to go".
    const m = goalMoment({ before: 4.1, after: 4.3, start: 4, target: 5, unit: "rating" });
    expect(m.detail).toMatch(/ 0\.7 rating to go\.$/);
  });
  it("reads a goal whose target is below its start as a cut", () => {
    // "Cut onboarding time from 3 hours to 2": standing at the start is not a
    // landing, coming down is progress, and going up is the drop.
    const atStart = goalMoment({ before: 3, after: 3, start: 3, target: 2, unit: "hours" });
    expect(atStart.tone).toBe("flat");
    const down = goalMoment({ before: 3, after: 2.75, start: 3, target: 2, unit: "hours" });
    expect(down.tone).toBe("up");
    expect(down.detail).toBe("25% of the way. 0.75 hours to go.");
    const crossing = goalMoment({ before: 2.75, after: 2.5, start: 3, target: 2, unit: "hours" });
    expect(crossing.tone).toBe("halfway");
    expect(crossing.headline).toBe("Halfway. 2.5 hours, on the way to 2.");
    const backUp = goalMoment({ before: 2.5, after: 2.75, start: 3, target: 2, unit: "hours" });
    expect(backUp.tone).toBe("down");
    expect(goalMoment({ before: 2.5, after: 2, start: 3, target: 2, unit: "hours" }).tone).toBe("landed");
    expect(goalMoment({ before: 2.5, after: 1.5, start: 3, target: 2, unit: "hours" }).tone).toBe("landed");
  });
  it("never scolds a drop and treats no change as a fact", () => {
    expect(goalMoment({ before: 30, after: 20, target: 100, unit: null }).detail).toMatch(/both ways/);
    expect(goalMoment({ before: 20, after: 20, target: 100, unit: null }).tone).toBe("flat");
  });
});
