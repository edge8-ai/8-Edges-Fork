// The optional due date of a client review cycle (CR.5.3). A due date is a
// calendar day, kept as "YYYY-MM-DD", with no time and no zone: the company
// works on Saigon time, so "today" is Saigon's today, and a date is late only
// once that day is over.

import { BUSINESS_TIME_ZONE, isTimeZone, saigonToday, zonedClock } from "@/kernel/config/dates";

const DUE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True when the value is a real calendar day written as YYYY-MM-DD (rejects 2026-02-31). */
export function isCalendarDay(value: string): boolean {
  if (!DUE_DATE_PATTERN.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** One message for the screen and the command, so a hand-made request reads the same as the form. */
export const PAST_DUE_DATE_MESSAGE = "The due date is in the past. Choose today or a later day, or leave it empty.";

/** A due date before today is past; today itself is fine. */
export function isPastDueDate(value: string, today: string = saigonToday()): boolean {
  return value < today;
}

/**
 * Today in the client's calendar, for the member's update window (CR.6). The
 * members work the client's hours, so the due day ends at midnight where the
 * client is (Khoa, 2026-11-19). A client with no time zone set falls back to
 * Saigon, which is what the cycle page says while it is unset.
 */
export function clientToday(timeZone: string | null | undefined, now: Date = new Date()): string {
  return zonedClock(now, isTimeZone(timeZone) ? timeZone : BUSINESS_TIME_ZONE).date;
}
