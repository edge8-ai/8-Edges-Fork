// Working days for an advance's deadline (AD.3, design section 2 and Q7, Q9).
//
// The calendar is handed in, because this file is pure and the screens preview a
// deadline as dates are picked. The server reads it through time-off's throwing
// door: a calendar that failed to load must refuse, never pass for "no holidays",
// because that deadline would come out early and make someone overdue.
//
// Client-safe: dates only. Everything is a Vietnam business date, "YYYY-MM-DD".
import { addDays, dateMs } from "@/kernel/config/dates";
import { REMINDER_WORKING_DAYS, SETTLE_WORKING_DAYS } from "./advance-policy";

/** One day the office is shut, as the holidays table holds it. */
export type HolidayDay = { date: string; name: string };

const TET = /t[eế]t/i;

function isWorkingDay(iso: string, off: ReadonlySet<string>): boolean {
  const weekday = new Date(dateMs(iso)).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !off.has(iso);
}

/** The working day `n` working days after `from` (before it, for a negative `n`). `from` itself is never counted. */
export function addWorkingDays(from: string, n: number, holidays: readonly HolidayDay[]): string {
  const off = new Set(holidays.map((h) => h.date));
  const step = n < 0 ? -1 : 1;
  let day = from;
  for (let left = Math.abs(n); left > 0; ) {
    day = addDays(day, step);
    if (isWorkingDay(day, off)) left -= 1;
  }
  return day;
}

/** Working days after `today` up to and including `until`; 0 once `until` has passed. */
export function workingDaysLeft(today: string, until: string, holidays: readonly HolidayDay[]): number {
  const off = new Set(holidays.map((h) => h.date));
  let count = 0;
  for (let day = addDays(today, 1); day <= until; day = addDays(day, 1)) {
    if (isWorkingDay(day, off)) count += 1;
  }
  return count;
}

/** The day the reminder goes for a deadline. */
export function reminderOn(settleBy: string, holidays: readonly HolidayDay[]): string {
  return addWorkingDays(settleBy, -REMINDER_WORKING_DAYS, holidays);
}

/**
 * The settle-by date: ten working days after the later of the spend and the
 * payout, so a slow transfer never makes a person overdue on money they did not
 * have (Q7).
 *
 * Refused when the count reaches a year whose Tết is not in the calendar. The
 * government publishes each year's dates, so a year can sit there half filled in,
 * and counting across its missing week would give a deadline that is too early
 * (Q9). A refusal stops the payout with a reason a person can act on.
 */
export function settleByOf(
  dates: { spendEndsOn: string; paidOutOn: string },
  holidays: readonly HolidayDay[],
): { ok: true; settleBy: string } | { ok: false; error: string } {
  const start = dates.spendEndsOn > dates.paidOutOn ? dates.spendEndsOn : dates.paidOutOn;
  const settleBy = addWorkingDays(start, SETTLE_WORKING_DAYS, holidays);
  const withTet = new Set(holidays.filter((h) => TET.test(h.name)).map((h) => h.date.slice(0, 4)));
  for (const year of new Set([start.slice(0, 4), settleBy.slice(0, 4)])) {
    if (!withTet.has(year)) {
      return { ok: false, error: `The ${year} holiday calendar is not complete, so the deadline cannot be worked out. Ask whoever keeps Time Off to add it.` };
    }
  }
  return { ok: true, settleBy };
}
