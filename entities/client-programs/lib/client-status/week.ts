import { businessDate, isoWeekKey, isoWeekMonday } from "@/kernel/config/dates";

// The week a client status report covers: the ISO week, in Saigon time, of the
// moment the opener runs. The opener runs Friday 10:00 in Vietnam, so a report
// covers Monday to that Friday of its own week; a Run now on a Monday opens the
// new week's rows, never last week's (spec risk 10).
//
// The table's check admits any YYYY-Www, W00 and W99 included, so the writer
// must not produce one: a week is valid only when it round-trips through the
// Monday that opens it.

/**
 * The first ISO week the weekly client status opens: 2026-W41, the week of
 * Monday 5 October 2026, so its first run is a Run now on Friday 9 October.
 * 2026-W40 and every week before it belonged to the library's retired
 * customer-status routine, so the opener never makes a second page for one of
 * those weeks. The library's W41 pages were withdrawn and deleted on 9 October
 * 2026 (Z.12.2), which is what lets this chain draft W41 without a client ever
 * having two pages for it.
 */
export const FIRST_STATUS_WEEK = "2026-W41";

/** The ISO week (YYYY-Www, Saigon time) `now` falls in. */
export function statusWeek(now: Date): string {
  return isoWeekKey(businessDate(now));
}

/** Whether `week` is a real ISO week: the shape, and a Monday that opens exactly that week. */
export function isStatusWeek(week: string): boolean {
  if (!/^\d{4}-W\d{2}$/.test(week)) return false;
  const monday = isoWeekMonday(week);
  return monday !== null && isoWeekKey(monday) === week;
}

/** The Monday (YYYY-MM-DD) that opens `week`. Throws on a week that is not one. */
export function weekMonday(week: string): string {
  const monday = isStatusWeek(week) ? isoWeekMonday(week) : null;
  if (!monday) throw new Error(`"${week}" is not an ISO week.`);
  return monday;
}

/** The moment `week` begins, midnight Monday in Saigon, as an ISO timestamp. */
export function weekStartsAt(week: string): string {
  return new Date(`${weekMonday(week)}T00:00:00+07:00`).toISOString();
}

/** "5 October": the Monday a week is named by on the page. */
export function weekLabel(week: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${weekMonday(week)}T00:00:00Z`));
}

/** The page's title, which the draft's version hashes too. */
export function statusTitle(week: string): string {
  return `Weekly status, week of ${weekLabel(week)}`;
}
