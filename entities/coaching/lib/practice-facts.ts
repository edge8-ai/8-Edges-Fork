import { diffDays, shiftMonth } from "@/kernel/config/dates";
// The outcome of one booking is decided in `missed.ts`, from its status and its
// day; these figures only count the answers it gives.
import type { MeetingOutcome } from "./missed";

// The figures the coach's dashboard draws (K.54, K.55): how much of this
// month's cadence actually happened, what the roster's commitments came to,
// how far apart the conversations have drifted, and how many goals carry a
// number — plus, since K.56, the two the disclosure under the tiles reveals:
// what else a goal is missing besides its number, and how the 1-1s that did
// not happen have run over six months.
//
// THE RULE THIS TYPE EXISTS TO ENFORCE. No field below names, keys or orders a
// person, and none may ever be added that does. Every figure counts a thing —
// a meeting, a commitment, a goal — over the whole roster, so there is no
// value here that a screen could sort people by. `daysSince` is the one array,
// and it is a bag of numbers in ascending order precisely so that its
// positions carry no identity: the chart drawn from it is a shape, and the
// coach who sees two dots drifting has to read the rows below to learn who,
// which is the humane order to learn it in. A sorted bar chart of the same
// numbers with names on it is a ranking of people by neglect and is banned.
// This is the same enforcement-by-return-type the Revenue hub uses
// (`entities/crm/lib/revenue-metrics/shared.ts`, and CLAUDE.md, "their row
// types carry no person column, which is where the rule is enforced").
export type PracticeFacts = {
  // 1-1s whose day falls in the current calendar month: the ones marked held,
  // and every booking on the month's calendar whatever became of it.
  heldThisMonth: number;
  plannedThisMonth: number;
  // Bookings this month whose day passed without the 1-1 happening. Reported
  // as a clause, never as a red state: rebooking one is a kindness (K.45).
  passedUnheld: number;
  // Commitments across the roster since each person's own last 1-1: the ones
  // closed, and everything that was promised (closed plus still open).
  kept: number;
  promised: number;
  // Active goals across the roster that carry a target number, out of all of
  // them. A goal without a measure is a coaching-craft signal, not a fault.
  goalsWithNumber: number;
  goalsTotal: number;
  // The rest of what a goal needs to be answerable, counted the same way as
  // its number: a unit the number is measured in, and a day it is due by. The
  // four-tile row only has room for the number, so these two are the detail the
  // disclosure reveals (K.56) rather than a second summary of the same thing.
  goalsWithMeasure: number;
  goalsWithDueDate: number;
  // Days since each person's last held 1-1, ascending and unattached; people
  // never met are left out, because "never" is not a distance.
  daysSince: number[];
  // How many of the roster have no held 1-1 yet, so the caption can say so
  // rather than quietly dropping them out of the distribution.
  neverMet: number;
  // Bookings whose day passed unheld, month by month, six months ending with
  // the current one and oldest first. Months with none are present as zeroes,
  // because a sparkline that skipped them would compress time and read as a
  // trend that never happened. Roster-wide, like everything else here: a
  // per-person "missed" count is a tally against a person, and the one place a
  // missed 1-1 is ever attached to a name is the row's own sentence, where it
  // is an offer to rebook rather than a figure.
  missedByMonth: MonthCount[];
};

export type MonthCount = { month: string; missed: number };

// How far back the sparkline reaches. Six points is above the four the chart
// guidance wants before a line beats a stat card, and short enough that every
// month on it is one a coach can still remember.
export const SPARK_MONTHS = 6;

// Nothing has happened and nothing is coming: no 1-1 held or booked this
// month, nothing promised, nobody ever met, no goal carrying a number. Four
// tiles then say "nothing" four ways and own the whole first screen of a
// phone, which is what a coach with two new people actually saw (review,
// 2026-09-18). One sentence says it better and gives the people the screen.
export function practiceIsBare(f: PracticeFacts): boolean {
  return (
    f.plannedThisMonth === 0 &&
    f.heldThisMonth === 0 &&
    f.promised === 0 &&
    f.goalsTotal === 0 &&
    f.daysSince.length === 0
  );
}

export const NO_PRACTICE: PracticeFacts = {
  heldThisMonth: 0,
  plannedThisMonth: 0,
  passedUnheld: 0,
  kept: 0,
  promised: 0,
  goalsWithNumber: 0,
  goalsTotal: 0,
  goalsWithMeasure: 0,
  goalsWithDueDate: 0,
  daysSince: [],
  neverMet: 0,
  // An empty roster has no months to draw, and the page does not render the
  // tiles at all in that case (K.56 replaces them with the empty state), so
  // there is nothing here to give a shape to.
  missedByMonth: [],
};

// What the loader hands in. The meeting and goal rows arrive already stripped
// of their profile id, and the per-person counts arrive as bare numbers in no
// meaningful order, so even the input to this function cannot be turned back
// into a table of people without going to the database again.
export type PracticeInput = {
  // The month's figures read only the current month out of this; the sparkline
  // reads the six months ending with it. The loader hands over the whole
  // window in one list rather than two, so the same row can never be counted
  // once as this month's and again as the series' last point.
  meetings: { day: string; outcome: MeetingOutcome }[];
  // One entry per person on the roster: what they closed and what is still
  // open since their own last 1-1, and when that 1-1 was.
  commitments: { kept: number; open: number }[];
  lastHeldOn: (string | null)[];
  goals: { hasNumber: boolean; hasMeasure: boolean; hasDueDate: boolean }[];
  // The dates the roster itself carries for its next 1-1s. A booking only
  // becomes a `coaching_one_on_ones` row four days out, when the cycle writes
  // the prep, so counting rows alone had the month tile say "Nothing booked"
  // while the rows underneath said "First 1-1 on Wednesday 30 Sep" — the tile
  // contradicting the page it sits on (review, 2026-09-18). A date already
  // represented by a meeting row is not counted twice.
  plannedOn: (string | null)[];
};

export function practiceFacts(input: PracticeInput, todayISO: string): PracticeFacts {
  const month = todayISO.slice(0, 7);
  const thisMonth = input.meetings.filter((m) => m.day.slice(0, 7) === month);

  const daysSince: number[] = [];
  let neverMet = 0;
  for (const last of input.lastHeldOn) {
    if (!last) {
      neverMet += 1;
      continue;
    }
    // A booking dated in the future would give a negative distance and a dot
    // off the left of the axis; clamping at zero reads as "today", which is
    // what a 1-1 held this morning should look like.
    daysSince.push(Math.max(diffDays(last, todayISO), 0));
  }

  const kept = sum(input.commitments.map((c) => Math.max(c.kept, 0)));
  const open = sum(input.commitments.map((c) => Math.max(c.open, 0)));

  // A date this month that no meeting row covers yet is still a 1-1 the coach
  // has in the calendar, and it is what the row below the tile says.
  const monthDays = new Set(thisMonth.map((m) => m.day));
  const plannedOnly = (input.plannedOn ?? []).filter(
    (d): d is string => typeof d === "string" && d.slice(0, 7) === todayISO.slice(0, 7) && !monthDays.has(d),
  ).length;

  return {
    heldThisMonth: thisMonth.filter((m) => m.outcome === "held").length,
    plannedThisMonth: thisMonth.length + plannedOnly,
    passedUnheld: thisMonth.filter((m) => m.outcome === "passed-unheld").length,
    kept,
    promised: kept + open,
    goalsWithNumber: input.goals.filter((g) => g.hasNumber).length,
    goalsTotal: input.goals.length,
    goalsWithMeasure: input.goals.filter((g) => g.hasMeasure).length,
    goalsWithDueDate: input.goals.filter((g) => g.hasDueDate).length,
    daysSince: daysSince.sort((a, b) => a - b),
    neverMet,
    missedByMonth: missedByMonth(input.meetings, todayISO),
  };
}

// The six months ending with today's, oldest first, each with the bookings
// whose day passed unheld in it. The buckets are built from the calendar
// rather than from the rows, so a quiet month is a zero on the line instead of
// a month the line silently skips over.
export function missedByMonth(
  meetings: { day: string; outcome: MeetingOutcome }[],
  todayISO: string,
): MonthCount[] {
  const y = Number(todayISO.slice(0, 4));
  // `Month.m` is 0-based, like Date.getMonth(), so the month in an ISO string
  // has to lose one before it can be shifted and gain it back afterwards.
  const m = Number(todayISO.slice(5, 7)) - 1;
  const counts = new Map<string, number>();
  for (const meeting of meetings) {
    if (meeting.outcome !== "passed-unheld") continue;
    const key = meeting.day.slice(0, 7);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from({ length: SPARK_MONTHS }, (_, i) => {
    const at = shiftMonth({ y, m }, i - (SPARK_MONTHS - 1));
    const month = `${at.y}-${String(at.m + 1).padStart(2, "0")}`;
    return { month, missed: counts.get(month) ?? 0 };
  });
}

function sum(ns: number[]): number {
  return ns.reduce((total, n) => total + n, 0);
}
