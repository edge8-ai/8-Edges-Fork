// The words on the card drawer's chips, exactly as the approved canvas reads
// them (W.159; https://claude.ai/artifact/EwRwp6V5VYUGgBuxxu5R6W). Pure, so the
// wording is pinned by tests without a DOM.
//
// Every date here is a date-only string (a due date, a sprint's first and last
// day), read and written in UTC on purpose: the string names a calendar day,
// not an instant, and formatting it in the machine's zone is how a server in
// one country and a browser in another came to disagree (the 2026-09-21
// hydration error). UTC turns "2026-10-10" back into the 10th everywhere.

import { greetingName } from "@/kernel/config/people-name";

const DAY_MS = 86_400_000;

function utcDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

// Fixed three-letter names rather than Intl: en-GB writes September "Sept",
// and a runtime's locale data must not decide what the chip says.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayOf = (iso: string) => utcDate(iso).getUTCDate();
const monthOf = (iso: string) => MONTHS[utcDate(iso).getUTCMonth()];

/** "Sat": a date's weekday, as every date on a chip names it. */
export function weekdayOf(iso: string): string {
  return WEEKDAYS[utcDate(iso).getUTCDay()] ?? "";
}

/** "10": a date's day of the month. */
export const dayOfMonth = dayOf;

/** "Sat 10 Oct": a due date as the pinned line shows it. */
export function chipDate(iso: string): string {
  return `${weekdayOf(iso)} ${dayOf(iso)} ${monthOf(iso)}`;
}

/** "2 Oct": a date with no weekday, where the words around it say what it is ("Overdue · 2 Oct"). */
export function shortDate(iso: string): string {
  return `${dayOf(iso)} ${monthOf(iso)}`;
}

/**
 * "Ada": the name beside a person's initials on a chip. A board person's name
 * is their display_name, Given + Family, so the kernel's greetingName() reads
 * the given name from it — the one place a name is cut to a word (S.14).
 */
export function firstName(name: string): string {
  return greetingName({ display_name: name }, name);
}

/**
 * A sprint as its chip reads it: the name, its days ("7–13 Oct", or
 * "29 Sep – 5 Oct" across a month), and whether it is this week or next,
 * judged against today's business date.
 */
export function sprintChip(
  sprint: { name: string; starts_on: string | null; ends_on?: string | null },
  today: string,
): { name: string; range: string | null; when: "this week" | "next week" | null } {
  const { starts_on: start, ends_on: end } = sprint;
  if (!start) return { name: sprint.name, range: null, when: null };
  const last = end ?? start;
  const sameMonth = start.slice(0, 7) === last.slice(0, 7);
  const range = sameMonth
    ? `${dayOf(start)}–${dayOf(last)} ${monthOf(last)}`
    : `${dayOf(start)} ${monthOf(start)} – ${dayOf(last)} ${monthOf(last)}`;
  const t = utcDate(today).getTime();
  const s = utcDate(start).getTime();
  const e = utcDate(last).getTime();
  const when = t >= s && t <= e ? "this week" : s > t && s - t <= 7 * DAY_MS ? "next week" : null;
  return { name: sprint.name, range, when };
}

/** The plan reference a card's title opens with ("W.181", "W.70.3"), after an optional [TAG]. */
export function cardRef(title: string): string | null {
  return /^(?:\[[A-Z]+\]\s+)?([A-Z]\.\d+(?:\.\d+)?)\s/.exec(`${title} `)?.[1] ?? null;
}

/**
 * The drawer's eyebrow: "8 Edges" over a saved card, "8 Edges · New card"
 * over a new one.
 *
 * The plan reference is NOT repeated here (bug hunt U4). cardRef only ever
 * reads a reference off the front of the title, so whenever there is one the
 * title right under the eyebrow already starts with it, and "8 Edges · W.181"
 * over "W.181 Redesign the drawer" said it twice. The reference comes back
 * only when there is no board name to show, so the eyebrow is never blank
 * for a card that has something to say.
 */
export function drawerEyebrow(boardName: string | null, title: string, isNew: boolean): string {
  if (isNew) return [boardName, "New card"].filter(Boolean).join(" · ");
  return boardName ?? cardRef(title) ?? "";
}
