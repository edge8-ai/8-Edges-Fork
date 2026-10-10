// The short dates My Week prints (W.169), built on the card chips' own date
// words (card-chips.ts) so a date reads the same on the page and on the card.
// A sprint fits in one week, so near today a weekday and a day of the month
// name the date ("Mon 12"); further out the month joins them ("Fri 30 Oct"),
// so "Mon 12" never names two days at once.
import { diffDays } from "@/kernel/config/dates";
import { chipDate, dayOfMonth, weekdayOf } from "./card-chips";

/** "Mon 12" within six days of today, "Fri 30 Oct" further out. */
export function nearDate(iso: string, today: string): string {
  return Math.abs(diffDays(today, iso)) <= 6 ? `${weekdayOf(iso)} ${dayOfMonth(iso)}` : chipDate(iso);
}

/** "Wed 7 – Tue 13 Oct": the sprint window. */
export function windowLabel(startsOn: string, endsOn: string): string {
  const sameMonth = startsOn.slice(0, 7) === endsOn.slice(0, 7);
  return `${sameMonth ? `${weekdayOf(startsOn)} ${dayOfMonth(startsOn)}` : chipDate(startsOn)} – ${chipDate(endsOn)}`;
}

/**
 * A row's date as words that cannot contradict its heading (W.171): "due
 * today", "due Thu 8", or "after sprint · Fri 30 Oct" once it is past the
 * sprint's last day — so a started card under In progress says when it is
 * really due instead of a bare date that reads as today's work.
 */
export function dueWords(due: string, today: string, endsOn: string): string {
  if (due === today) return "due today";
  if (due > endsOn) return `after sprint · ${nearDate(due, today)}`;
  return `due ${nearDate(due, today)}`;
}
