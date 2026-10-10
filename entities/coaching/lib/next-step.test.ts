import { describe, expect, it } from "vitest";
import { nextStep } from "./next-step";

const base = { activeGoals: 1, hasNextDate: true, formOpen: false, answered: false, blocked: 0, onIt: 2, heldMeetings: 3 };

describe("nextStep", () => {
  it("starts with the goal when there is none", () => {
    expect(nextStep({ ...base, activeGoals: 0 }).tab).toBe("goals");
  });
  it("asks for the agenda when the form is open and empty, and not once answered", () => {
    expect(nextStep({ ...base, formOpen: true }).cta).toBe("Set the agenda");
    expect(nextStep({ ...base, formOpen: true, answered: true }).cta).not.toBe("Set the agenda");
  });
  it("points at a blocked card before anything else on the board", () => {
    expect(nextStep({ ...base, blocked: 2 }).title).toBe("2 cards are blocked");
    expect(nextStep({ ...base, blocked: 2 }).anchor).toBe("board");
    // It owns the blocked sentence, so the strip's cell stops repeating it.
    expect(nextStep({ ...base, blocked: 2 }).covers).toBe("blocked");
    expect(nextStep(base).covers).toBeUndefined();
  });
  it("asks for a first date when none is set and they have never met", () => {
    expect(nextStep({ ...base, hasNextDate: false, onIt: 0, heldMeetings: 0 }).cta).toBe("Pick a day");
  });
  it("never calls a member who has met their coach a first-timer when nothing is booked", () => {
    // Nothing booked is the normal state between 1-1s (ADR-0010); the step
    // falls through to the board rather than "Pick a day for your first 1-1".
    const step = nextStep({ ...base, hasNextDate: false });
    expect(step.title).not.toMatch(/first 1-1/);
    expect(step.cta).toBe("See the board");
  });
  it("suggests the board or the history when nothing is waiting", () => {
    expect(nextStep(base).cta).toBe("See the board");
    expect(nextStep({ ...base, onIt: 0 }).tab).toBe("history");
    expect(nextStep({ ...base, onIt: 0, heldMeetings: 0 }).tab).toBe("overview");
  });
  // Every suggestion has to land somewhere: the button used to switch to the
  // tab it was already on, which looked broken (K.53).
  it("always names an anchor, and the anchor belongs to the tab it opens", () => {
    const onTab: Record<string, string[]> = { overview: ["board"], goals: ["goal"], my: ["prep"], history: ["history"] };
    const cases = [
      { ...base, activeGoals: 0 },
      { ...base, formOpen: true },
      { ...base, blocked: 1 },
      { ...base, hasNextDate: false, onIt: 0, heldMeetings: 0 },
      { ...base, hasNextDate: false },
      base,
      { ...base, onIt: 0 },
      { ...base, onIt: 0, heldMeetings: 0 },
    ];
    for (const input of cases) {
      const step = nextStep(input);
      expect(onTab[step.tab]).toContain(step.anchor);
    }
  });
});
