import { diffDays } from "@/kernel/config/dates";
import { describeDay, WEEKDAY_NAMES } from "./cadence";

// The small words the coach's roster is written in: how a day is named, and
// how far away something is. They sit apart from help-lines.ts because both
// halves of that file use them — the help lines and the row sentences — so
// they are a shared vocabulary rather than a detail of either, and because
// every one of them reads its answer out of the date string alone, which is
// what keeps the server's locale and timezone from getting a say.

// "30 Sep" — a past or future day named without its weekday.
export function dayOnly(iso: string): string {
  return describeDay(iso).split(" ").slice(1).join(" ");
}

export function inDays(away: number): string {
  if (away < 0) return `${-away} ${-away === 1 ? "day" : "days"} ago`;
  if (away === 0) return "today";
  if (away === 1) return "tomorrow";
  return `in ${away} days`;
}

// A day inside the last week reads as its weekday, because that is how a coach
// remembers it; anything older reads as a date.
export function whenLabel(iso: string, todayISO: string): string {
  const ago = diffDays(iso, todayISO);
  if (ago === 0) return "today";
  if (ago === 1) return "yesterday";
  if (ago > 1 && ago < 7) return WEEKDAY_NAMES[new Date(`${iso}T00:00:00Z`).getUTCDay()];
  return dayOnly(iso);
}
