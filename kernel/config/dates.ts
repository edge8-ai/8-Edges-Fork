// Calendar-date helpers on YYYY-MM-DD strings with Saigon-date semantics. The
// business runs on Asia/Ho_Chi_Minh, so "today" is the Saigon calendar date no
// matter where the server happens to run; arithmetic is done in UTC on the
// date-only string so DST and server timezone can never shift a day.

const DAY_MS = 86_400_000;

// Today's date in Saigon as YYYY-MM-DD (en-CA is the locale whose default
// format is exactly ISO date order).
/** The business timezone: every calendar-day reading of a timestamp is taken here, on the
 * server and in the browser alike, so a server-rendered date and its hydration agree. */
export const BUSINESS_TIME_ZONE = "Asia/Ho_Chi_Minh";

export function saigonToday(): string {
  return businessDate(new Date());
}

/** The business calendar date (YYYY-MM-DD) a timestamp falls on. Slicing an ISO string
 * gives the UTC date instead, which is the previous day for anything after 17:00 Saigon. */
export function businessDate(at: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE }).format(typeof at === "string" ? new Date(at) : at);
}

// Midnight UTC of a YYYY-MM-DD string, in ms.
export function dateMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

// `iso` plus `days` calendar days (negative allowed), as YYYY-MM-DD.
export function addDays(iso: string, days: number): string {
  return new Date(dateMs(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

// Whole days from `fromISO` to `toISO` (negative when `toISO` is earlier).
export function diffDays(fromISO: string, toISO: string): number {
  return Math.round((dateMs(toISO) - dateMs(fromISO)) / DAY_MS);
}

// ISO 8601 week of a YYYY-MM-DD date as "YYYY-Www" (weeks start Monday, week
// 1 holds the year's first Thursday). The company sprint calendar keys on it:
// a sprint runs Wednesday to Tuesday and takes the week of its Wednesday.
export function isoWeekKey(iso: string): string {
  const d = new Date(dateMs(iso));
  // Shift to the Thursday of the same ISO week; its calendar year is the ISO year.
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const year = d.getUTCFullYear();
  const jan4 = Date.UTC(year, 0, 4);
  const week1Thursday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY_MS + 3 * DAY_MS;
  const week = 1 + Math.round((d.getTime() - week1Thursday) / (7 * DAY_MS));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

// The Monday that opens an ISO week key, as YYYY-MM-DD; null for a malformed key.
export function isoWeekMonday(key: string): string | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const jan4 = Date.UTC(year, 0, 4);
  const week1Monday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY_MS;
  return new Date(week1Monday + (Number(m[2]) - 1) * 7 * DAY_MS).toISOString().slice(0, 10);
}

// A calendar month, 0-based like Date.getMonth(), for the month-grid pickers.
export type Month = { y: number; m: number };

// `month` moved `by` months (negative allowed). Done on the absolute month
// count rather than on a Date, so it can never land on a shorter month and
// roll over (new Date(2026, 0, 31) shifted a month is March, not February).
export function shiftMonth({ y, m }: Month, by: number): Month {
  const t = y * 12 + m + by;
  return { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
}

// ─── The working week ────────────────────────────────────────────────────
// A due date on a Saturday or a Sunday turns overdue the next day (Sunday or
// Monday) for no reason anybody chose, and then it colours red on the board and in the daily
// digest. These three let a date picker SAY so; nothing here rewrites a date.
// The offer is the point — some weeks are like that, and the board does not
// get to tell people when to work (W.68).

/** Saturday or Sunday, read on the date-only string so no timezone can shift it. */
export function isWeekend(iso: string): boolean {
  const day = new Date(dateMs(iso)).getUTCDay();
  return day === 0 || day === 6;
}

/** The last working day on or before `iso`: Friday for a weekend date, `iso` itself otherwise. */
export function previousWorkday(iso: string): string {
  const day = new Date(dateMs(iso)).getUTCDay();
  if (day === 6) return addDays(iso, -1);
  if (day === 0) return addDays(iso, -2);
  return iso;
}

/** The next working day on or after `iso`: Monday for a weekend date, `iso` itself otherwise. */
export function nextWorkday(iso: string): string {
  const day = new Date(dateMs(iso)).getUTCDay();
  if (day === 6) return addDays(iso, 2);
  if (day === 0) return addDays(iso, 1);
  return iso;
}
