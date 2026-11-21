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

/**
 * A Saigon date and time of day as an instant (ISO, UTC). Saigon is UTC+7 all
 * year, so the pair is one fixed offset from UTC; null when either part is not
 * a well-formed "YYYY-MM-DD" / "HH:MM". The Quests forms (a head's due time, a
 * fire's time) share it.
 */
export function saigonInstant(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const at = new Date(`${date}T${time}:00+07:00`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

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

/** `n` working days (Monday to Friday) before `iso`, skipping weekends. */
export function workdaysBefore(iso: string, n: number): string {
  let day = iso;
  for (let left = n; left > 0; ) {
    day = addDays(day, -1);
    if (!isWeekend(day)) left--;
  }
  return day;
}

// ─── Another place's wall clock ──────────────────────────────────────────
// A client works in its own time zone (CR.5.4): a review email is set for a
// date and a time at the client, and the instant it goes is that wall clock
// read in the client's IANA zone. Saigon keeps one offset all year, so the
// helpers above need no lookup; another zone may keep daylight saving, so
// these ask Intl for the offset at the instant itself, which is what keeps
// "9:00 am in New York" right on both sides of a clock change.

const zoneFormats = new Map<string, Intl.DateTimeFormat>();

function zoneFormat(timeZone: string): Intl.DateTimeFormat {
  let f = zoneFormats.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    zoneFormats.set(timeZone, f);
  }
  return f;
}

/** Whether `timeZone` is an IANA zone this runtime knows ("America/New_York"). */
export function isTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone) return false;
  try {
    zoneFormat(timeZone);
    return true;
  } catch {
    return false;
  }
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The wall clock in `timeZone` at an instant: its calendar date, its "HH:MM", its weekday (0 Sunday) and its minute of the day. */
export function zonedClock(at: Date | string, timeZone: string): { date: string; time: string; weekday: number; minute: number } {
  const parts = Object.fromEntries(zoneFormat(timeZone).formatToParts(typeof at === "string" ? new Date(at) : at).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    weekday: WEEKDAYS.indexOf(parts.weekday),
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

// How far the zone's wall clock is ahead of UTC at a whole-minute instant, in ms.
function offsetAt(utcMs: number, timeZone: string): number {
  const c = zonedClock(new Date(utcMs), timeZone);
  return Date.parse(`${c.date}T${c.time}:00Z`) - utcMs;
}

/**
 * A date and a time of day at a place, as an instant (ISO, UTC); null when a
 * part is malformed or the zone unknown. A time the clocks skip (02:30 on the
 * morning they go forward) is read as the same time after the change (03:30),
 * and a time that happens twice (01:30 on the morning they go back) as its
 * first occurrence.
 */
export function zonedInstant(date: string, time: string, timeZone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) || !isTimeZone(timeZone)) return null;
  const wall = Date.parse(`${date}T${time}:00Z`);
  if (Number.isNaN(wall)) return null;
  const first = offsetAt(wall, timeZone);
  const guess = wall - first;
  const second = offsetAt(guess, timeZone);
  if (second === first) return new Date(guess).toISOString();
  const retry = wall - second;
  // The two readings stay apart only inside a skipped hour, and the later
  // one is the wall clock carried forward by the change.
  return new Date(offsetAt(retry, timeZone) === second ? retry : Math.max(guess, retry)).toISOString();
}

/**
 * What people call a zone, from Intl ("Eastern" for America/New_York), or its
 * city when Intl has no name for it. Runtimes differ in these names, so the
 * server reads it once and hands the words to the page.
 */
export function timeZoneLabel(timeZone: string): string {
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longGeneric" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    if (name && !/^GMT/.test(name)) return name.replace(/\s+Time$/, "");
  } catch {
    // An unknown zone falls through to its own name.
  }
  return (timeZone.split("/").pop() ?? timeZone).replace(/_/g, " ");
}

/** A calendar day as "Fri 4 Dec", from a fixed list: Intl's en-GB prints "Sept". */
export function shortDay(iso: string): string {
  const d = new Date(dateMs(iso));
  if (Number.isNaN(d.getTime())) return iso;
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** A calendar day as "4 Dec", from the same fixed list. */
export function dayMonth(iso: string): string {
  const d = new Date(dateMs(iso));
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** A calendar day as "Nov 17", the overview's short date, from the same fixed list. */
export function monthDay(iso: string): string {
  const d = new Date(dateMs(iso));
  if (Number.isNaN(d.getTime())) return iso;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "HH:MM" on a 12-hour clock, as "9:00 am" or "9:30 pm". */
export function clockLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
