import { describe, expect, it } from "vitest";
import { sessionDoneText, sessionTarget } from "./session-done";

describe("sessionTarget", () => {
  const passed = { id: "o-passed", day: "2026-10-01" };
  const ahead = { id: "o-ahead", day: "2026-10-08" };

  it("closes a booking whose day passed unanswered before anything else", () => {
    expect(sessionTarget({ booked: ahead, awaiting: passed }, "2026-10-06")).toEqual({ kind: "close-passed", row: passed });
  });

  it("closes the booking on the day they met", () => {
    expect(sessionTarget({ booked: ahead, awaiting: null }, "2026-10-08")).toEqual({ kind: "close-booked", row: ahead });
  });

  it("moves a booking still ahead to the earlier day they actually met", () => {
    expect(sessionTarget({ booked: ahead, awaiting: null }, "2026-10-06")).toEqual({ kind: "close-early", row: ahead });
  });

  it("keeps a booking ahead when the coach says it was an extra conversation", () => {
    expect(sessionTarget({ booked: ahead, awaiting: null }, "2026-10-02", "extra")).toEqual({ kind: "record", day: "2026-10-02" });
  });

  it("records an extra conversation even while a passed booking waits for its answer", () => {
    expect(sessionTarget({ booked: null, awaiting: passed }, "2026-10-06", "extra")).toEqual({ kind: "record", day: "2026-10-06" });
  });

  it("records a session with nothing booked on the day it happened", () => {
    expect(sessionTarget({ booked: null, awaiting: null }, "2026-10-06")).toEqual({ kind: "record", day: "2026-10-06" });
  });
});

describe("sessionDoneText", () => {
  it("asks the employee for their own update and never reports one for them", () => {
    const text = sessionDoneText({ coachName: "Khoa", dayLabel: "Tue 6 Oct", hasNote: false });
    expect(text).toBe("Khoa marked your 1-1 on Tue 6 Oct done. Take a minute to update your FAST goal or write a short reflection.");
  });

  it("mentions the note when the coach left one", () => {
    expect(sessionDoneText({ coachName: "Khoa", dayLabel: "Tue 6 Oct", hasNote: true })).toContain("and left you a note");
  });
});
