// The Admin Home's dates (AH.2), in the team pages' words.
import { dateMs } from "@/kernel/config/dates";
import { MONTHS } from "./dashboard-helpers";

// ── Dates, in the team pages' words ──

// Built from fixed names rather than toLocaleDateString: en-GB writes
// September as "Sept", which no other date on the admin pages does.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
const parts = (iso: string) => {
  const d = new Date(dateMs(iso));
  return { wd: d.getUTCDay(), day: d.getUTCDate(), month: d.getUTCMonth() };
};

/** "29 Sep": a past date on an overdue row, where the weekday says nothing. */
export function shortDate(iso: string): string {
  const { day, month } = parts(iso);
  return `${day} ${MONTHS[month]}`;
}
/** "Thu 29 Oct". */
export function dayLabel(iso: string): string {
  return `${WEEKDAYS[parts(iso).wd]} ${shortDate(iso)}`;
}
/** "Tuesday 27 October". */
export function longDate(iso: string): string {
  const { wd, day, month } = parts(iso);
  return `${WEEKDAYS_LONG[wd]} ${day} ${MONTHS_LONG[month]}`;
}
/** "Sunday". */
export function weekday(iso: string): string {
  return WEEKDAYS_LONG[parts(iso).wd];
}
