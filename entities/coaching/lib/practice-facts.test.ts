import { describe, expect, it } from "vitest";
import {
  practiceFacts,
  practiceIsBare,
  type PracticeInput,
} from "./practice-facts";
import { meetingOutcome, type MeetingOutcome } from "./missed";

// Every case is anchored on a fixed day inside September so "this month" has a
// readable meaning, and the August rows prove the month window is a filter and
// not a sum of everything ever booked.
const TODAY = "2026-09-17";

function input(over: Partial<PracticeInput> = {}): PracticeInput {
  return { meetings: [], commitments: [], lastHeldOn: [], goals: [], plannedOn: [], ...over };
}

function meeting(day: string, outcome: MeetingOutcome) {
  return { day, outcome };
}

// A goal with everything, so each case only has to say what its goal is
// missing rather than restate the two fields it does not care about.
function goal(over: Partial<PracticeInput["goals"][number]> = {}) {
  return { hasNumber: true, hasMeasure: true, hasDueDate: true, ...over };
}

describe("practiceFacts", () => {
  it("reports nothing for an empty practice", () => {
    const facts = practiceFacts(input(), TODAY);
    expect(facts.plannedThisMonth).toBe(0);
    expect(facts.promised).toBe(0);
    expect(facts.daysSince).toEqual([]);
  });

  it("counts this month's bookings and only this month's", () => {
    const facts = practiceFacts(
      input({
        meetings: [
          meeting("2026-08-28", "held"),
          meeting("2026-09-02", "held"),
          meeting("2026-09-09", "held"),
          meeting("2026-09-11", "passed-unheld"),
          meeting("2026-09-25", "booked"),
          meeting("2026-10-02", "booked"),
        ],
      }),
      TODAY,
    );
    expect(facts.heldThisMonth).toBe(2);
    // A booking that passed unheld was still planned, which is the whole point
    // of the bullet chart: the gap between the bar and the marker is the news.
    expect(facts.plannedThisMonth).toBe(4);
    expect(facts.passedUnheld).toBe(1);
  });

  it("counts a 1-1 missed then marked held once, in the tile that says it happened", () => {
    // The row the database carries after a late "mark it held": status held,
    // on its booked day, with the held-late stamp beside it (A.31). Run through
    // the boundary it is one outcome, so it reaches one tile.
    const outcome = meetingOutcome({ status: "held", heldOn: "2026-09-11" }, TODAY);
    const facts = practiceFacts(
      input({ meetings: [{ day: "2026-09-11", outcome }, meeting("2026-09-14", "passed-unheld")] }),
      TODAY,
    );
    expect(facts.heldThisMonth).toBe(1);
    expect(facts.passedUnheld).toBe(1);
    // The stamped-then-held booking is not on the line either: the six months
    // are what did not happen, and this one did.
    expect(facts.missedByMonth[facts.missedByMonth.length - 1]).toEqual({
      month: "2026-09",
      missed: 1,
    });
    // The invariant the bullet chart draws and the two tiles imply: a booking
    // is either held or it passed unheld, so the two can never come to more
    // than the month planned. This is the assertion that failed before K.67,
    // and the one that fails again if a figure starts reading the two database
    // columns apart.
    expect(facts.heldThisMonth + facts.passedUnheld).toBeLessThanOrEqual(facts.plannedThisMonth);
  });

  it("adds the roster's commitments into kept out of promised", () => {
    const facts = practiceFacts(
      input({
        commitments: [
          { kept: 3, open: 1 },
          { kept: 0, open: 2 },
          { kept: 2, open: 0 },
        ],
      }),
      TODAY,
    );
    expect(facts.kept).toBe(5);
    expect(facts.promised).toBe(8);
  });

  it("treats a negative count as nothing rather than subtracting it", () => {
    const facts = practiceFacts(input({ commitments: [{ kept: -4, open: 1 }] }), TODAY);
    expect(facts.kept).toBe(0);
    expect(facts.promised).toBe(1);
  });

  it("sorts the days since ascending and keeps nobody's position", () => {
    const facts = practiceFacts(
      input({ lastHeldOn: ["2026-08-20", "2026-09-10", null, "2026-09-16"] }),
      TODAY,
    );
    expect(facts.daysSince).toEqual([1, 7, 28]);
    expect(facts.neverMet).toBe(1);
  });

  it("clamps a 1-1 dated ahead of today to zero days", () => {
    expect(practiceFacts(input({ lastHeldOn: ["2026-09-30"] }), TODAY).daysSince).toEqual([0]);
  });

  it("splits goals by whether they carry a number", () => {
    const facts = practiceFacts(
      input({ goals: [goal(), goal({ hasNumber: false }), goal()] }),
      TODAY,
    );
    expect(facts.goalsWithNumber).toBe(2);
    expect(facts.goalsTotal).toBe(3);
  });

  it("counts a goal's measure and due date apart from its number", () => {
    const facts = practiceFacts(
      input({
        goals: [
          goal(),
          goal({ hasMeasure: false }),
          goal({ hasDueDate: false, hasMeasure: false }),
          goal({ hasNumber: false }),
        ],
      }),
      TODAY,
    );
    expect(facts.goalsTotal).toBe(4);
    expect(facts.goalsWithNumber).toBe(3);
    expect(facts.goalsWithMeasure).toBe(2);
    expect(facts.goalsWithDueDate).toBe(3);
  });

  it("buckets the 1-1s that did not happen into six months, oldest first", () => {
    const facts = practiceFacts(
      input({
        meetings: [
          meeting("2026-04-08", "passed-unheld"),
          meeting("2026-06-02", "passed-unheld"),
          meeting("2026-06-19", "passed-unheld"),
          meeting("2026-09-11", "passed-unheld"),
          // A booking that happened is not a booking that did not happen, and
          // a month outside the window is outside the line.
          meeting("2026-07-07", "held"),
          meeting("2026-01-05", "passed-unheld"),
        ],
      }),
      TODAY,
    );
    expect(facts.missedByMonth).toEqual([
      { month: "2026-04", missed: 1 },
      { month: "2026-05", missed: 0 },
      { month: "2026-06", missed: 2 },
      { month: "2026-07", missed: 0 },
      { month: "2026-08", missed: 0 },
      { month: "2026-09", missed: 1 },
    ]);
  });

  it("walks the series back across a year boundary", () => {
    // February is the case the 0-based month arithmetic gets wrong when an ISO
    // month number is shifted without losing its one first.
    const months = practiceFacts(input(), "2027-02-14").missedByMonth.map((m) => m.month);
    expect(months).toEqual(["2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  it("returns no field that could identify or order a person", () => {
    const facts = practiceFacts(
      input({ commitments: [{ kept: 1, open: 1 }], lastHeldOn: ["2026-09-01"] }),
      TODAY,
    );
    // The guard is the shape itself: if a later change adds a per-person key
    // to the aggregate, this assertion is what fails and asks why.
    expect(Object.keys(facts).sort()).toEqual([
      "daysSince",
      "goalsTotal",
      "goalsWithDueDate",
      "goalsWithMeasure",
      "goalsWithNumber",
      "heldThisMonth",
      "kept",
      "missedByMonth",
      "neverMet",
      "passedUnheld",
      "plannedThisMonth",
      "promised",
    ]);
  });
});

describe("the month tile counts what the calendar carries, not only what has a row", () => {
  it("counts a date this month that no meeting row covers yet", () => {
    // The cycle writes the meeting row four days out, so a 1-1 booked for the
    // 30th has no row on the 17th — and the tile used to say "Nothing booked"
    // above a row saying "First 1-1 on Wednesday 30 Sep".
    const f = practiceFacts(input({ plannedOn: ["2026-09-30", "2026-09-30"] }), TODAY);
    expect(f.plannedThisMonth).toBe(2);
    expect(f.heldThisMonth).toBe(0);
  });

  it("does not count a date twice when its meeting row exists", () => {
    const f = practiceFacts(
      input({ meetings: [meeting("2026-09-30", "booked")], plannedOn: ["2026-09-30"] }),
      TODAY,
    );
    expect(f.plannedThisMonth).toBe(1);
  });

  it("ignores a date in another month", () => {
    expect(practiceFacts(input({ plannedOn: ["2026-10-02"] }), TODAY).plannedThisMonth).toBe(0);
  });
});

describe("practiceIsBare", () => {
  it("is true when nothing has happened and nothing is booked", () => {
    expect(practiceIsBare(practiceFacts(input(), TODAY))).toBe(true);
  });

  it("is false as soon as the calendar carries a date", () => {
    expect(practiceIsBare(practiceFacts(input({ plannedOn: ["2026-09-30"] }), TODAY))).toBe(false);
  });

  it("is false when something was promised, even with an empty calendar", () => {
    expect(practiceIsBare(practiceFacts(input({ commitments: [{ kept: 0, open: 2 }] }), TODAY))).toBe(false);
  });
});
