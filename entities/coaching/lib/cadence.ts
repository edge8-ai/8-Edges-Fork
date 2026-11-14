import { addDays, dateMs } from "@/kernel/config/dates";
import type { Result } from "@/kernel/data/result";

// The 1-1 schedule's suggested date is computed from a pair's own 1-1s when it
// is read (one-on-one-schedule.ts, ADR-0010). What stayed here are the date
// helpers it and the pages share. The roll-forward that stepped a stored date
// by the cadence, and the Wednesday guess built on it, went with that date.

// The occurrence of `weekday` nearest to `iso`: at most three days either way.
// Seven is odd, so there is never a tie: from a Wednesday, Sunday is three days
// back rather than four ahead.
export function nearestWeekday(iso: string, weekday: number): string {
  const day = new Date(dateMs(iso)).getUTCDay();
  let delta = ((weekday - day) % 7 + 7) % 7;
  if (delta > 3) delta -= 7;
  return addDays(iso, delta);
}

// The first date on or after `iso` that falls on `weekday`: where an overdue
// rhythm is suggested, the soonest day that keeps it.
export function nextWeekdayOnOrAfter(iso: string, weekday: number): string {
  const day = new Date(dateMs(iso)).getUTCDay();
  return addDays(iso, ((weekday - day) % 7 + 7) % 7);
}

// A weekday number as English, read from the number alone so the server's
// locale never gets a say.
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

// A month number as its short English name, read from the number alone for the
// same reason the weekdays are. Exported since K.56 because the practice
// sparkline labels months too, and a second copy of this array is how the two
// would come to disagree about how to spell September.
export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

// "Wednesday 23 Sep" — how both sides name a proposed day (K.32). Read from
// the date string alone, like every other date helper here, so the server's
// locale and timezone never get a say.
export function describeDay(iso: string): string {
  const d = new Date(dateMs(iso));
  return `${WEEKDAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
}

// "15:00" from a Postgres time value ("15:00:00"); null stays null.
export function shortTime(time: string | null | undefined): string | null {
  if (!time) return null;
  const m = /^(\d{2}):(\d{2})/.exec(time);
  return m ? `${m[1]}:${m[2]}` : null;
}

// When a booking starts: the time on the meeting itself, else the hour the
// member said suits them (K.34). A booking with no time of its own is only
// genuinely timeless when the member has never named one either, and both the
// coach's roster and the member's own page have to agree about that — a second
// copy of this rule is how one page comes to announce that a 1-1 has no time
// while the other is showing one, and building a calendar file from it.
export function meetingStartsAt(
  startsAt: string | null | undefined,
  preferredTime: string | null | undefined,
): string | null {
  return shortTime(startsAt) ?? shortTime(preferredTime);
}

// A date a 1-1 may be put on: a real YYYY-MM-DD, not in the past, and on a
// weekday. It lives here rather than beside the proposal that first needed it
// (K.32) because the move (K.33) applies exactly the same rule, and a second
// copy is how the two would drift. Nobody holds a 1-1 at the weekend.
// A member's proposed day, while it can still be answered. Nothing clears a
// proposal except the coach's confirm or decline, so a day that passed
// unanswered used to sit at the top of the coach's row asking for a confirm
// that books the past or is refused (K.79). Read through this, a passed
// proposal is simply no longer there; the stored value is harmless and the
// next proposal overwrites it.
export function openProposal(dateISO: string | null, todayISO: string): string | null {
  return dateISO && dateISO >= todayISO ? dateISO : null;
}

export function validateProposedDate(dateISO: string, todayISO: string): Result {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return { ok: false, error: "Pick a day first." };
  if (Number.isNaN(dateMs(dateISO))) return { ok: false, error: "Pick a day first." };
  if (dateISO < todayISO) return { ok: false, error: "Pick a day that has not passed." };
  const day = new Date(dateMs(dateISO)).getUTCDay();
  if (day === 0 || day === 6) return { ok: false, error: "1-1s run Monday to Friday. Pick a weekday." };
  return { ok: true };
}
