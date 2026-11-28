import { describe, expect, it } from "vitest";
import { scheduleOf, type ScheduleRow } from "./one-on-one-schedule";
import type { LeaveSpan } from "./leave-window";

// One table over the whole rule (A.31, ADR-0010). Weekdays are spelled out in
// the case names because the rule is about weekdays, and a date whose weekday
// was guessed is how the 26-day case was first misread.

let seq = 0;
function row(day: string, status: ScheduleRow["status"], movedFrom: string | null = null): ScheduleRow {
  seq += 1;
  return { id: `m-${seq}`, day, status, movedFrom };
}

type Case = {
  name: string;
  rows: ScheduleRow[];
  today: string;
  cadence?: number | null;
  leave?: LeaveSpan[];
  paused?: boolean;
  booked: string | null;
  awaiting: string | null;
  suggested: string | null;
};

const MON_28 = "2026-09-28";

const CASES: Case[] = [
  {
    name: "never met: nothing booked, nothing to count from, so no suggestion",
    rows: [],
    today: MON_28,
    booked: null,
    awaiting: null,
    suggested: null,
  },
  {
    name: "a first 1-1 booked ahead is the next 1-1, and nothing is suggested",
    rows: [row("2026-10-01", "scheduled")],
    today: MON_28,
    booked: "2026-10-01",
    awaiting: null,
    suggested: null,
  },
  {
    name: "a 1-1 booked today is today's 1-1",
    rows: [row("2026-09-15", "held"), row(MON_28, "scheduled")],
    today: MON_28,
    booked: MON_28,
    awaiting: null,
    suggested: null,
  },
  {
    name: "the earliest of two bookings ahead is the next one",
    rows: [row("2026-10-13", "scheduled"), row("2026-10-06", "scheduled")],
    today: MON_28,
    booked: "2026-10-06",
    awaiting: null,
    suggested: null,
  },
  {
    name: "a booking whose day went by waits for an answer, and nothing is suggested",
    rows: [row("2026-09-09", "held"), row("2026-09-23", "scheduled")],
    today: MON_28,
    booked: null,
    awaiting: "2026-09-23",
    suggested: null,
  },
  {
    name: "a held mark undone on a past 1-1 brings the question back",
    rows: [row("2026-09-22", "scheduled")],
    today: MON_28,
    booked: null,
    awaiting: "2026-09-22",
    suggested: null,
  },
  {
    name: "a booking ahead and a passed one: both are reported, no suggestion",
    rows: [row("2026-09-16", "scheduled"), row("2026-10-07", "scheduled")],
    today: MON_28,
    booked: "2026-10-07",
    awaiting: "2026-09-16",
    suggested: null,
  },
  {
    name: "of two passed bookings the latest is the one waiting",
    rows: [row("2026-09-09", "scheduled"), row("2026-09-23", "scheduled")],
    today: MON_28,
    booked: null,
    awaiting: "2026-09-23",
    suggested: null,
  },
  {
    name: "held Tue 22 Sep on a 14-day cadence suggests Tue 6 Oct",
    rows: [row("2026-09-08", "held"), row("2026-09-22", "held")],
    today: MON_28,
    booked: null,
    awaiting: null,
    suggested: "2026-10-06",
  },
  {
    name: "a skip anchors like a held 1-1: skipped Tue 22 Sep suggests Tue 6 Oct",
    rows: [row("2026-09-08", "held"), row("2026-09-22", "skipped")],
    today: MON_28,
    booked: null,
    awaiting: null,
    suggested: "2026-10-06",
  },
  {
    name: "the latest of held and skipped wins, whichever it is",
    rows: [row("2026-09-22", "held"), row("2026-09-08", "skipped")],
    today: MON_28,
    booked: null,
    awaiting: null,
    suggested: "2026-10-06",
  },
  {
    name: "a Wed 23 Sep 1-1 moved to Thu 24 keeps the Wednesday rhythm: Wed 7 Oct",
    rows: [row("2026-09-24", "held", "2026-09-23")],
    today: MON_28,
    booked: null,
    awaiting: null,
    suggested: "2026-10-07",
  },
  {
    name: "the 26-day case: held Fri 11 Sep, due Fri 25, seen Sat 26 -> the soonest Friday, 2 Oct",
    rows: [row("2026-09-11", "held")],
    today: "2026-09-26",
    booked: null,
    awaiting: null,
    suggested: "2026-10-02",
  },
  {
    name: "an overdue rhythm is never pushed a whole cadence later: held Wed 26 Aug -> Wed 30 Sep",
    rows: [row("2026-08-26", "held")],
    today: MON_28,
    booked: null,
    awaiting: null,
    suggested: "2026-09-30",
  },
  {
    name: "a due day that is today is suggested for today",
    rows: [row("2026-09-14", "held")],
    today: MON_28,
    booked: null,
    awaiting: null,
    suggested: MON_28,
  },
  {
    name: "a suggestion on approved leave moves to the next clear day on the same weekday",
    rows: [row("2026-09-22", "held")],
    today: MON_28,
    leave: [{ startDate: "2026-10-05", endDate: "2026-10-07" }],
    booked: null,
    awaiting: null,
    suggested: "2026-10-13",
  },
  {
    name: "a paused rhythm suggests nothing, but still reports what is booked",
    rows: [row("2026-09-22", "held"), row("2026-10-20", "scheduled")],
    today: MON_28,
    paused: true,
    booked: "2026-10-20",
    awaiting: null,
    suggested: null,
  },
  {
    name: "a paused rhythm with nothing booked suggests nothing",
    rows: [row("2026-09-22", "held")],
    today: MON_28,
    paused: true,
    booked: null,
    awaiting: null,
    suggested: null,
  },
  {
    name: "a 1-1 skipped in advance does not anchor until its day comes",
    // Booked 8 Oct and 22 Oct; the coach skipped the 22nd on 3 Oct. The cycle
    // must still run to the 8th, not begin after it.
    rows: [row("2026-09-24", "held"), row("2026-10-08", "scheduled"), row("2026-10-22", "skipped")],
    today: "2026-10-03",
    booked: "2026-10-08",
    awaiting: null,
    suggested: null,
  },
  {
    name: "a pair whose only 1-1 was skipped has never met: nothing suggested",
    rows: [row("2026-09-23", "skipped")],
    today: MON_28,
    booked: null,
    awaiting: null,
    suggested: null,
  },
  {
    name: "a zero cadence counts as 14",
    rows: [row("2026-09-22", "held")],
    today: MON_28,
    cadence: 0,
    booked: null,
    awaiting: null,
    suggested: "2026-10-06",
  },
  {
    name: "no cadence counts as 14",
    rows: [row("2026-09-22", "held")],
    today: MON_28,
    cadence: null,
    booked: null,
    awaiting: null,
    suggested: "2026-10-06",
  },
  {
    name: "a weekly cadence steps seven days",
    rows: [row("2026-09-22", "held")],
    today: MON_28,
    cadence: 7,
    booked: null,
    awaiting: null,
    suggested: "2026-09-29",
  },
];

describe("scheduleOf", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const s = scheduleOf({
        rows: c.rows,
        cadenceDays: c.cadence === undefined ? 14 : c.cadence,
        leave: c.leave ?? [],
        today: c.today,
        paused: c.paused,
      });
      expect({ booked: s.booked?.day ?? null, awaiting: s.awaiting?.day ?? null, suggested: s.suggested }).toEqual({
        booked: c.booked,
        awaiting: c.awaiting,
        suggested: c.suggested,
      });
    });
  }

  it("anchors the cycle only on a 1-1 whose day has come", () => {
    const s = scheduleOf({
      rows: [row("2026-09-24", "held"), row("2026-10-08", "scheduled"), row("2026-10-22", "skipped")],
      cadenceDays: 14,
      leave: [],
      today: "2026-10-03",
    });
    expect(s.lastOn).toBe("2026-09-24");
  });

  it("counts a pair as met only once a 1-1 was held", () => {
    const today = MON_28;
    expect(scheduleOf({ rows: [row("2026-09-23", "skipped")], cadenceDays: 14, leave: [], today }).hasMet).toBe(false);
    expect(scheduleOf({ rows: [row("2026-09-08", "held"), row("2026-09-23", "skipped")], cadenceDays: 14, leave: [], today }).hasMet).toBe(true);
  });

  it("reports the last held or skipped day, and nothing for a pair never met", () => {
    const today = MON_28;
    expect(scheduleOf({ rows: [], cadenceDays: 14, leave: [], today }).lastOn).toBeNull();
    expect(scheduleOf({ rows: [row("2026-10-01", "scheduled")], cadenceDays: 14, leave: [], today }).lastOn).toBeNull();
    expect(
      scheduleOf({ rows: [row("2026-09-08", "held"), row("2026-09-22", "skipped"), row("2026-10-06", "scheduled")], cadenceDays: 14, leave: [], today }).lastOn,
    ).toBe("2026-09-22");
  });

  it("hands back the booked row itself, so a caller writes to the right one", () => {
    const booked = row("2026-10-06", "scheduled");
    expect(scheduleOf({ rows: [booked], cadenceDays: 14, leave: [], today: MON_28 }).booked).toBe(booked);
  });
});
