import { describe, expect, it } from "vitest";
import { heldLate, meetingOutcome, missedLine, splitBookings, type MeetingOutcome } from "./missed";
import type { OneOnOneStatus } from "./types";

// What became of one 1-1 is derived from its status and its day, and held late
// from the day the coach marked it held (ADR-0010): nothing a routine stamps.
const TODAY = "2026-09-17";

describe("missedLine", () => {
  it("names the day and states the fact, with no count in it", () => {
    expect(missedLine("2026-09-16", (iso) => iso)).toBe("1-1 on 2026-09-16 did not happen");
  });
});

describe("meetingOutcome", () => {
  it("reads a booking on today or later as still to come", () => {
    expect(meetingOutcome({ status: "scheduled", heldOn: "2026-09-17" }, TODAY)).toBe("booked");
    expect(meetingOutcome({ status: "scheduled", heldOn: "2026-09-20" }, TODAY)).toBe("booked");
  });

  it("reads a booking whose day passed as passed unheld, from the day alone", () => {
    expect(meetingOutcome({ status: "scheduled", heldOn: "2026-09-16" }, TODAY)).toBe("passed-unheld");
  });

  it("never asks about a 1-1 that is no longer a booking, however long ago", () => {
    // A held 1-1 happened and a skipped one was deliberately let go; neither is
    // waiting on an answer.
    expect(meetingOutcome({ status: "held", heldOn: "2026-08-01" }, TODAY)).toBe("held");
    expect(meetingOutcome({ status: "skipped", heldOn: "2026-08-01" }, TODAY)).toBe("skipped");
  });
});

// Every status, on a past and a future day, and with and without the held-late
// stamp, in one table. The bug this module exists to prevent is a caller
// answering one of these questions its own way. Read down the columns: held
// late is only ever true for a held row, and never beside an unanswered one.
describe("the two questions, over every status, day and stamp", () => {
  const cases: {
    status: OneOnOneStatus;
    heldOn: string;
    markedHeldOn: string | null;
    outcome: MeetingOutcome;
    awaiting: boolean;
    late: boolean;
  }[] = [
    { status: "scheduled", heldOn: "2026-09-20", markedHeldOn: null, outcome: "booked", awaiting: false, late: false },
    { status: "scheduled", heldOn: "2026-09-16", markedHeldOn: null, outcome: "passed-unheld", awaiting: true, late: false },
    { status: "held", heldOn: "2026-09-16", markedHeldOn: null, outcome: "held", awaiting: false, late: false },
    { status: "held", heldOn: "2026-09-16", markedHeldOn: "2026-09-16", outcome: "held", awaiting: false, late: false },
    { status: "held", heldOn: "2026-09-16", markedHeldOn: "2026-09-17", outcome: "held", awaiting: false, late: true },
    { status: "skipped", heldOn: "2026-09-16", markedHeldOn: null, outcome: "skipped", awaiting: false, late: false },
  ];

  for (const c of cases) {
    it(`${c.status} on ${c.heldOn}${c.markedHeldOn ? `, marked held ${c.markedHeldOn}` : ""} is ${c.outcome}${c.late ? ", held late" : ""}`, () => {
      expect(meetingOutcome(c, TODAY)).toBe(c.outcome);
      expect(meetingOutcome(c, TODAY) === "passed-unheld").toBe(c.awaiting);
      expect(heldLate(c)).toBe(c.late);
    });
  }

  it("never calls one booking both unanswered and held late", () => {
    for (const c of cases) expect(meetingOutcome(c, TODAY) === "passed-unheld" && heldLate(c)).toBe(false);
  });

  it("keeps held-late inside the held count, which is why it is not a fifth outcome", () => {
    // The month tile counts `outcome === "held"`. If held-late had become its
    // own outcome value this assertion would fail, and nothing else would have.
    expect(meetingOutcome({ status: "held", heldOn: "2026-09-16" }, TODAY)).toBe("held");
  });
});

describe("splitBookings", () => {
  const row = (id: string, heldOn: string, outcome: MeetingOutcome) => ({ id, heldOn, outcome });

  it("calls the earliest booking still to come the next 1-1, never a passed one", () => {
    const { next, passed } = splitBookings([
      row("old", "2026-09-29", "passed-unheld"),
      row("later", "2026-10-20", "booked"),
      row("soon", "2026-10-08", "booked"),
      row("held", "2026-09-15", "held"),
    ]);
    expect(next?.id).toBe("soon");
    expect(passed.map((m) => m.id)).toEqual(["old"]);
  });

  it("has no next 1-1 when the only booking has passed", () => {
    const { next, passed } = splitBookings([row("old", "2026-09-29", "passed-unheld")]);
    expect(next).toBeNull();
    expect(passed.map((m) => m.id)).toEqual(["old"]);
  });

  it("lists passed bookings newest first", () => {
    const { passed } = splitBookings([
      row("a", "2026-09-01", "passed-unheld"),
      row("b", "2026-09-29", "passed-unheld"),
    ]);
    expect(passed.map((m) => m.id)).toEqual(["b", "a"]);
  });
});
