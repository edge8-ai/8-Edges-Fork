// A card can repeat (W.59).
//
// Recurring work is today either a cron nobody can see on the board, or a
// card somebody retypes every week. Neither shows up as work in flight, which
// is the whole reason the board exists.
//
// `metadata.repeat = { every: "week" | "month", until? }`. When a repeating
// card lands in a done column its successor is created, dated forward, in the
// column the card came from, carrying the repeat with it.
//
// THE TWIN-WRITE IS THE HARD PART. Two people closing the same card within
// seconds must not produce two successors, and a timestamp guard ("did we
// make one in the last minute?") is exactly the guard that fails under a
// race. The successor carries `metadata.repeat_of = <the closed card's id>`
// and the check is for the EXISTENCE of that row, read immediately before the
// insert — the same twin-write the workboard-cards audit looks for.

import { dateMs, shiftMonth } from "@/kernel/config/dates";

export const REPEAT_EVERY = ["week", "month"] as const;
export type RepeatEvery = (typeof REPEAT_EVERY)[number];
export type CardRepeat = { every: RepeatEvery; until: string | null };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The repeat on a card, or null. Defensive for the same reason every other
 * metadata reader here is: the column has no constraint, and a shape this
 * cannot read must mean "does not repeat" rather than throwing on a board
 * page or, worse, creating a successor nobody asked for.
 */
export function cardRepeat(card: { metadata: Record<string, unknown> }): CardRepeat | null {
  const v = card.metadata?.["repeat"];
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const raw = v as { every?: unknown; until?: unknown };
  if (!REPEAT_EVERY.includes(raw.every as RepeatEvery)) return null;
  const until = typeof raw.until === "string" && DATE.test(raw.until) ? raw.until : null;
  return { every: raw.every as RepeatEvery, until };
}

/** The card this row is the successor of, or null (W.59's twin-write guard). */
export function repeatOf(card: { metadata: Record<string, unknown> }): string | null {
  const v = card.metadata?.["repeat_of"];
  return typeof v === "string" && v ? v : null;
}

/**
 * `iso` plus `n` months, clamped to the end of the target month.
 *
 * 31 January plus a month is 28 (or 29) February, not 3 March. kernel's
 * `shiftMonth` already refuses the rollover for a {y, m} pair; this is the
 * same rule for a whole date, and it is here rather than in the kernel
 * because "the last of the month repeats on the last of the month" is a
 * decision about recurring CARDS, not a fact about calendars.
 */
export function addMonths(iso: string, n: number): string {
  const d = new Date(dateMs(iso));
  const { y, m } = shiftMonth({ y: d.getUTCFullYear(), m: d.getUTCMonth() }, n);
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDay);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * The next date in a repeat, from a YYYY-MM-DD date.
 *
 * It steps from the OLD DUE DATE, not from today: a weekly card closed three
 * days late is still due on its weekday, and stepping from the close would
 * let a repeat drift a little further every time somebody was busy.
 */
export function nextDate(from: string, every: RepeatEvery): string {
  return every === "week" ? new Date(dateMs(from) + 7 * 86_400_000).toISOString().slice(0, 10) : addMonths(from, 1);
}

/**
 * Should a successor be created at all, and with what due date?
 *
 * `null` means no: the card does not repeat, or the next instance would fall
 * after the repeat's `until`. A repeat with no due date still repeats — the
 * work recurs whether or not anybody put a date on it — and its successor
 * simply has no date either.
 */
export function plannedSuccessor(
  card: { metadata: Record<string, unknown>; due_date: string | null },
  today: string,
): { repeat: CardRepeat; dueDate: string | null } | null {
  const repeat = cardRepeat(card);
  if (!repeat) return null;
  const dueDate = card.due_date && DATE.test(card.due_date) ? nextDate(card.due_date, repeat.every) : null;
  // `until` closes the series. Measured against the next DUE date where there
  // is one, and against today where there is not, because that is the date
  // the next instance is actually about.
  if (repeat.until && (dueDate ?? today) > repeat.until) return null;
  return { repeat, dueDate };
}
