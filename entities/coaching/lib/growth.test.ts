import { describe, expect, it } from "vitest";
import { keptNote, personalRecords, plantStage, plantTitle, ringState, unlocks } from "./growth";

describe("ringState", () => {
  const cards = [
    { owner: "member", status: "completed", oneOnOneId: "m1" },
    { owner: "member", status: "on_track", oneOnOneId: "m1" },
    { owner: "member", status: "completed", oneOnOneId: "m0" },
    { owner: "coach", status: "open", oneOnOneId: "m1" },
    { owner: "member", status: "dropped", oneOnOneId: "m1" },
  ];
  it("counts only the member's cards from the last held 1-1, dropped ones excluded", () => {
    expect(ringState(cards, "m1")).toEqual({ made: 2, kept: 1, closed: false });
  });
  it("closes when everything promised is kept", () => {
    expect(ringState([cards[0], cards[3]], "m1")).toEqual({ made: 1, kept: 1, closed: true });
  });
  it("never closes for free", () => {
    expect(ringState(cards, null).closed).toBe(false);
    expect(ringState([], "m1")).toEqual({ made: 0, kept: 0, closed: false });
  });
});

describe("plantStage and plantTitle", () => {
  it("grows one stage per five kept and never past the last stage", () => {
    expect(plantStage(0)).toBe(0);
    expect(plantStage(4)).toBe(0);
    expect(plantStage(5)).toBe(1);
    expect(plantStage(14)).toBe(2);
    expect(plantStage(99)).toBe(5);
  });
  it("names the next leaf, never a miss", () => {
    expect(plantTitle(0)).toMatch(/seed/i);
    expect(plantTitle(3)).toContain("Five grows the first leaf");
    expect(plantTitle(7)).toContain("comes at 10");
    expect(plantTitle(40)).toContain("fully grown");
  });
});

describe("unlocks", () => {
  it("opens History at the first held 1-1, the next rung at the first goal, the brag document at the third 1-1", () => {
    expect(unlocks({ heldMeetings: 0, goalsSaved: 0 })).toEqual({ history: false, nextRung: false, bragDocument: false });
    expect(unlocks({ heldMeetings: 1, goalsSaved: 1 })).toEqual({ history: true, nextRung: true, bragDocument: false });
    expect(unlocks({ heldMeetings: 3, goalsSaved: 0 })).toEqual({ history: true, nextRung: false, bragDocument: true });
  });
});

describe("personalRecords", () => {
  it("picks the meeting with the best share kept, more kept breaking a tie", () => {
    const r = personalRecords({
      meetings: [
        { heldOn: "2026-09-10", kept: 2, made: 2 },
        { heldOn: "2026-08-27", kept: 3, made: 3 },
        { heldOn: "2026-08-13", kept: 1, made: 4 },
        { heldOn: "2026-07-30", kept: 0, made: 0 },
      ],
      goals: [],
      forms: [],
    });
    expect(r.bestMeeting).toEqual({ heldOn: "2026-08-27", kept: 3, made: 3 });
  });
  it("finds the quarter the goal moved most and counts the forms written", () => {
    const r = personalRecords({
      meetings: [],
      goals: [
        { quarterLabel: "2026-Q2", title: "Ship", startValue: 0, currentValue: 3, metricUnit: "clients" },
        { quarterLabel: "2026-Q3", title: "Ramp", startValue: 10, currentValue: 19, metricUnit: "students" },
        { quarterLabel: null, title: "No quarter", startValue: 0, currentValue: 50, metricUnit: null },
      ],
      forms: [
        { moved: "x", stuck: null, talk: null },
        { moved: "  ", stuck: null, talk: null },
        { moved: null, stuck: null, talk: "y" },
      ],
    });
    expect(r.goalMovedMost).toEqual({ quarterLabel: "2026-Q3", title: "Ramp", moved: 9, unit: "students" });
    expect(r.formsWritten).toBe(2);
  });
  it("has no records before there is anything to record", () => {
    expect(personalRecords({ meetings: [], goals: [], forms: [] })).toEqual({ bestMeeting: null, goalMovedMost: null, formsWritten: 0 });
  });
});

describe("keptNote — the member's own summary never leads with a zero", () => {
  const fmt = (iso: string) => iso.slice(5);
  it("names what was kept this cycle when something was", () => {
    expect(keptNote({ keptSince: 2, totalKept: 6, lastHeldOn: "2026-08-26", formatDate: fmt })).toBe("2 kept since 08-26");
  });
  it("reaches for the lifetime figure rather than reporting a zero", () => {
    expect(keptNote({ keptSince: 0, totalKept: 4, lastHeldOn: "2026-08-26", formatDate: fmt })).toBe("4 kept in all");
  });
  it("says a fresh cycle when there is genuinely nothing yet", () => {
    expect(keptNote({ keptSince: 0, totalKept: 0, lastHeldOn: "2026-08-26", formatDate: fmt })).toBe("a fresh cycle");
  });
  it("drops the date when no 1-1 has been held", () => {
    expect(keptNote({ keptSince: 3, totalKept: 3, lastHeldOn: null, formatDate: fmt })).toBe("3 kept");
  });
});
