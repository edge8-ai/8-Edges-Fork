// Business time for notices (Z.7): when a notice may reach a person, read in
// Asia/Ho_Chi_Minh, where the company works. The notification router holds a
// non-urgent immediate notice that lands outside these hours until the next
// working morning, and every digest goes out on a working morning.
//
// Vietnam has kept UTC+7 all year since 1975, with no daylight saving, so the
// offset is a constant rather than a time-zone lookup. That keeps these pure
// and cheap, and makes the boundaries in the tests exact.
//
// Public holidays are not known here yet (v1): a holiday weekday counts as a
// working day. The working window is org-level configuration in code; there is
// no per-person setting, which would need a design Khoa approves first.

import { addDays, isWeekend, zonedClock, zonedInstant } from "@/kernel/config/dates";

const OFFSET_MS = 7 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** The working window on a weekday, in minutes after midnight, Saigon time: 09:00 to 18:00. */
export const WORKING_HOURS = { startMinute: 9 * 60, endMinute: 18 * 60 } as const;

// The Saigon wall clock for an instant: the weekday (0 Sunday) and the minute of the day.
function wallClock(at: Date): { weekday: number; minute: number; midnightUtcMs: number } {
  const shifted = new Date(at.getTime() + OFFSET_MS);
  const midnightShifted = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return {
    weekday: shifted.getUTCDay(),
    minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    // Saigon midnight of that day, as a real instant.
    midnightUtcMs: midnightShifted - OFFSET_MS,
  };
}

const isWeekday = (weekday: number) => weekday >= 1 && weekday <= 5;

/** Whether `at` falls inside the working window: Monday to Friday, 09:00 up to (not including) 18:00 Saigon time. */
export function inWorkingHours(at: Date): boolean {
  const { weekday, minute } = wallClock(at);
  return isWeekday(weekday) && minute >= WORKING_HOURS.startMinute && minute < WORKING_HOURS.endMinute;
}

/** Quiet hours are everything else: weekday nights and the whole weekend. */
export function inQuietHours(at: Date): boolean {
  return !inWorkingHours(at);
}

/**
 * The first working morning (a weekday at 09:00 Saigon time) strictly after
 * `at`. A held notice waits for it, and a digest item is sent on it. Strictly
 * after, so a digest queued at 09:00 on the dot goes in the next morning's
 * digest rather than racing the one being sent.
 */
export function nextWorkingMorning(at: Date): Date {
  const { midnightUtcMs } = wallClock(at);
  for (let day = 0; day <= 7; day++) {
    const morning = midnightUtcMs + day * DAY_MS + WORKING_HOURS.startMinute * MINUTE_MS;
    if (morning > at.getTime() && isWeekday(wallClock(new Date(morning)).weekday)) return new Date(morning);
  }
  // Unreachable: any eight consecutive days hold a weekday morning after `at`.
  throw new Error("no working morning within a week");
}

/**
 * The end of the last working window (a weekday at 18:00 Saigon time) at or
 * before `at`. A reminder that must go before a deadline outside the window
 * goes before this instead (Z.20): it cannot be held to the next morning,
 * because by then the deadline has passed.
 */
export function previousWorkingEvening(at: Date): Date {
  const { midnightUtcMs } = wallClock(at);
  for (let day = 0; day <= 7; day++) {
    const evening = midnightUtcMs - day * DAY_MS + WORKING_HOURS.endMinute * MINUTE_MS;
    if (evening <= at.getTime() && isWeekday(wallClock(new Date(evening)).weekday)) return new Date(evening);
  }
  // Unreachable: any eight consecutive days hold a weekday evening before `at`.
  throw new Error("no working evening within a week");
}

/**
 * `minuteOfDay` (minutes after midnight, Saigon time) on the last working day
 * strictly before the Saigon day `at` falls on. A Wednesday gives Tuesday, and
 * a Monday, a Saturday or a Sunday gives Friday. A caller that wants the result
 * inside the working window passes a minute inside it (WORKING_HOURS).
 */
export function workingDayBefore(at: Date, minuteOfDay: number): Date {
  const { midnightUtcMs } = wallClock(at);
  for (let day = 1; day <= 7; day++) {
    const midnight = midnightUtcMs - day * DAY_MS;
    if (isWeekday(wallClock(new Date(midnight)).weekday)) return new Date(midnight + minuteOfDay * MINUTE_MS);
  }
  // Unreachable: any seven consecutive days hold a weekday.
  throw new Error("no working day within a week");
}

// ─── A client's working day ──────────────────────────────────────────────
// Members staffed with a client work the client's hours, so the email that
// asks them for their review reaches them inside the client's working day,
// not Saigon's (CR.5 spec, "Send window"). Everything above stays the window
// for everyone else. A client's day is Monday to Friday in its own zone, from
// the start the owner set on the client (09:00 when none is set), for as long as
// the company's own day: nine hours.

/** How long a working day lasts, the company's own window. */
const WORKING_DAY_MS = (WORKING_HOURS.endMinute - WORKING_HOURS.startMinute) * MINUTE_MS;

/** A client's working day: its IANA zone and the minute its day starts. */
type ClientWorkingDay = { timeZone: string; startMinute: number };

/** The minute a client's day starts, from the stored "HH:MM[:SS]"; 09:00 when none is set. */
export function workingDayStartMinute(value: string | null | undefined): number {
  const m = /^(\d{2}):(\d{2})/.exec(value ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : WORKING_HOURS.startMinute;
}

/** A minute of the day as "HH:MM". */
export function minuteToTime(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

// The instant a client's day starts on a calendar date at the client.
function clientStartOn(date: string, day: ClientWorkingDay): number {
  const at = zonedInstant(date, minuteToTime(day.startMinute), day.timeZone);
  if (!at) throw new Error(`unknown time zone ${day.timeZone}`);
  return Date.parse(at);
}

/** Whether `at` falls inside the client's working day: a weekday there, from its start up to (not including) nine hours later. */
export function inClientWorkingDay(at: Date, day: ClientWorkingDay): boolean {
  const today = zonedClock(at, day.timeZone).date;
  // A day that starts late in the afternoon runs past midnight, so the day
  // before is asked too.
  return [today, addDays(today, -1)].some((d) => {
    if (isWeekend(d)) return false;
    const start = clientStartOn(d, day);
    return at.getTime() >= start && at.getTime() < start + WORKING_DAY_MS;
  });
}

/** The first start of a client's working day strictly after `at`. */
export function nextClientWorkingStart(at: Date, day: ClientWorkingDay): Date {
  const today = zonedClock(at, day.timeZone).date;
  for (let i = 0; i <= 8; i++) {
    const d = addDays(today, i);
    if (isWeekend(d)) continue;
    const start = clientStartOn(d, day);
    if (start > at.getTime()) return new Date(start);
  }
  // Unreachable: any nine consecutive days hold a weekday start after `at`.
  throw new Error("no client working day within a week");
}
