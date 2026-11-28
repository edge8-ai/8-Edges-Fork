import { addDays, dateMs } from "@/kernel/config/dates";
import { nearestWeekday, nextWeekdayOnOrAfter } from "./cadence";
import { nextClearDay, type LeaveSpan } from "./leave-window";
import type { OneOnOneStatus } from "./types";

// The 1-1 schedule (CONTEXT.md; ADR-0010): a profile's booked 1-1, the 1-1
// awaiting an answer, and the suggested date, answered together so none of the
// three can disagree with the others.
//
// Only a booked 1-1 says when the next 1-1 is. Until 27 September 2026 the
// profile carried a date of its own that thirteen code paths wrote beside the
// booked rows, and a daily routine rewrote it as a Wednesday guess that looked
// exactly like a booking. The guess invented first dates for people who had
// never met and stretched one fortnightly rhythm to 26 days. Here the suggested
// date is computed from the rows every time it is read, so there is no second
// copy to drift and no routine that writes one.
//
// Pure, so every rule below is one row of the table in its test.

/** One live (not archived) 1-1, as the schedule needs to see it. */
export type ScheduleRow = {
  id: string;
  day: string;
  status: OneOnOneStatus;
  // The day it sat on before its last move, when it was moved.
  movedFrom: string | null;
};

export type Schedule<R extends ScheduleRow = ScheduleRow> = {
  // The earliest booked 1-1 on today or later: the next 1-1.
  booked: R | null;
  // The latest booked 1-1 whose day went by with nobody marking it held or
  // skipped: passed unheld. The passing day is the fact; nothing stamps it.
  awaiting: R | null;
  // The day that would keep the pair's rhythm, when nothing is booked.
  suggested: string | null;
  // The day of the last held or skipped 1-1 on or before today: where the
  // current cycle began. Null when there is none.
  lastOn: string | null;
  // Whether the pair has had a 1-1: a held one. A skip is a cycle let go, not a
  // meeting, so a pair whose only 1-1 was skipped has still never met. Someone
  // who has not met gets no suggested day and books their first one directly;
  // after that a day they name is a proposal the coach confirms (K.32, A.31).
  hasMet: boolean;
};

// The weekday a date string falls on, read from the string alone so the
// server's timezone never gets a say.
function weekdayOf(iso: string): number {
  return new Date(dateMs(iso)).getUTCDay();
}

export function scheduleOf<R extends ScheduleRow>(input: {
  rows: R[];
  cadenceDays: number | null;
  leave: LeaveSpan[];
  today: string;
  // The coach paused the rhythm: "leave this person alone until I resume".
  paused?: boolean;
}): Schedule<R> {
  const { rows, today } = input;
  let booked: R | null = null;
  let awaiting: R | null = null;
  let anchor: R | null = null;
  let hasMet = false;
  for (const r of rows) {
    if (r.status === "scheduled") {
      if (r.day >= today) {
        if (!booked || r.day < booked.day) booked = r;
      } else if (!awaiting || r.day > awaiting.day) {
        awaiting = r;
      }
    } else if (r.day <= today) {
      if (r.status === "held") hasMet = true;
      // Held and skipped both anchor: a skip used up that cycle, so counting
      // from the older held 1-1 would suggest a day already behind the pair. A
      // 1-1 skipped in advance does not anchor until its day comes, or the
      // current cycle would begin after the booking that ends it.
      if (!anchor || r.day > anchor.day) anchor = r;
    }
  }

  // Nothing is suggested while a booking stands, while a passed one waits for
  // the coach's answer (the question comes first), for someone who has never
  // had a 1-1 (their first one is agreed with them, never guessed), or while
  // the coach has paused the rhythm.
  const lastOn = anchor?.day ?? null;
  if (booked || awaiting || !anchor || !hasMet || input.paused) return { booked, awaiting, suggested: null, lastOn, hasMet };

  // The pair's weekday is the day they agreed, so a 1-1 moved for a holiday
  // carries the day it was moved from: one move must not shift the rhythm for
  // good.
  const weekday = weekdayOf(anchor.movedFrom ?? anchor.day);
  const step = input.cadenceDays && input.cadenceDays > 0 ? input.cadenceDays : 14;
  let due = nearestWeekday(addDays(anchor.day, step), weekday);
  // Overdue means the soonest such weekday from today, never a whole cadence
  // later: stepping by the cadence until the date passed today is how a
  // fortnightly rhythm came to be suggested 26 days out.
  if (due < today) due = nextWeekdayOnOrAfter(today, weekday);
  const suggested = nextClearDay(due, input.leave, weekday);
  return { booked, awaiting, suggested, lastOn, hasMet };
}
