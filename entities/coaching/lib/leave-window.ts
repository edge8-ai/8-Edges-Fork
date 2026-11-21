import { addDays } from "@/kernel/config/dates";

// Scheduling a 1-1 around somebody's leave (L.2).
//
// Pure, so the rule can be read and tested without a database, and so the
// coach's picker and the member's propose form cannot answer the question
// differently. The reads themselves go through time-off's door; everything
// below works on plain spans.
//
// The tone is the whole design. A day somebody is away is not a conflict, an
// error or a warning — it is a fact about a colleague's holiday, and the page
// says so in the coach's own voice and offers the next clear day. Nothing here
// returns a severity, and there is deliberately no red.

/** One approved absence, inclusive of both ends, as time-off stores it. */
export type LeaveSpan = { startDate: string; endDate: string };

// How far forward to look for a clear day before giving up. Three weeks covers
// a fortnightly cadence plus a week of slip; past that, a coach is not
// rescheduling, they are planning a different quarter.
export const CLEAR_DAY_HORIZON = 21;

// How far BACK the leave window reaches, and why it has to reach back at all.
//
// The forward half of L.2 asks "can they make this day", which only ever looks
// ahead. The backward half asks "was this missed 1-1 actually a holiday", and
// that date is always in the PAST: the cycle stamps a miss only once the day
// has gone, and then holds the roll-forward while the grace window is open.
//
// Shipped with a forward-only window, the second question could only ever be
// answered "no" once the holiday ended — so a member who missed their 1-1 while
// away was told so on the day they got back, which is precisely the moment the
// feature existed to stay quiet (bug hunt 2026-09-18, BH-1).
//
// Sixty days rather than the grace window's few, because a cron that did not
// run leaves a miss sitting for as long as it sits, and this is a small table.
export const LEAVE_LOOKBACK = 60;

/** Whether a date falls inside any span. Both ends inclusive. */
export function onLeave(dateISO: string, spans: LeaveSpan[]): boolean {
  return spans.some((s) => dateISO >= s.startDate && dateISO <= s.endDate);
}

/**
 * The span covering a date, for the sentence that explains it.
 *
 * Returned rather than a boolean because "Derek is on leave that Wednesday"
 * tells a coach nothing they can act on, while "Derek is on leave Mon 22 to Wed
 * 24" tells them to look at Thursday.
 */
export function leaveCovering(dateISO: string, spans: LeaveSpan[]): LeaveSpan | null {
  return spans.find((s) => dateISO >= s.startDate && dateISO <= s.endDate) ?? null;
}

/**
 * The first day from `fromISO` that nobody is away on.
 *
 * When the member has said which weekday suits them (K.34) that weekday is
 * preferred: the search still walks day by day, but a matching weekday wins over
 * an earlier day that does not match, so a Thursday person is not quietly moved
 * to Tuesdays for the rest of the quarter by a single clash.
 *
 * Null when the whole horizon is covered, which is a real answer — a coach
 * facing a month of leave should be told that, not handed a date past it.
 */
export function nextClearDay(
  fromISO: string,
  spans: LeaveSpan[],
  preferredWeekday: number | null,
  horizon: number = CLEAR_DAY_HORIZON,
): string | null {
  let firstClear: string | null = null;
  for (let i = 0; i <= horizon; i++) {
    const day = addDays(fromISO, i);
    if (onLeave(day, spans)) continue;
    if (firstClear === null) firstClear = day;
    if (preferredWeekday === null) return day;
    if (new Date(`${day}T00:00:00`).getDay() === preferredWeekday) return day;
  }
  // The preferred weekday is entirely covered inside the horizon: the earliest
  // clear day beats no answer at all.
  return firstClear;
}

/**
 * Whether a 1-1 that did not happen should prompt anybody (L.2).
 *
 * A meeting missed because the person was on holiday is not a missed meeting in
 * any sense the product should raise — it is a holiday. The K.36 prompt reads
 * as a fault to whoever sees it, so it stays quiet here.
 */
export function missWorthPrompting(missedOnISO: string | null, spans: LeaveSpan[]): boolean {
  if (!missedOnISO) return false;
  return !onLeave(missedOnISO, spans);
}
