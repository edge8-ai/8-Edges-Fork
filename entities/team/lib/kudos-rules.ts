// Kudos (TH.1.8): the rules a note follows and the month it sits on. Kept
// apart from kudos.ts, which reads the database, so the browser's composer can
// share the same limit and the same clean-up without pulling a server client in.
import { shiftMonth } from "@/kernel/config/dates";

/** The longest note the table accepts (kudos_body_length in the migration). */
export const KUDOS_MAX = 280;

/** How many faces the composer offers before "Anyone else". */
export const QUICK_FACES = 5;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The Saigon month an ISO day falls in: "2026-10". */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** A month string from a query parameter, or null when it is not one. */
export function parseMonth(value: string | null | undefined): string | null {
  return value && MONTH.test(value) ? value : null;
}

/** The month `delta` months from `month`: addMonths("2026-01", -1) is "2025-12". */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const to = shiftMonth({ y, m: m - 1 }, delta);
  return `${to.y}-${String(to.m + 1).padStart(2, "0")}`;
}

/** "October", or "October 2025" when the month is not in `currentMonth`'s year. */
export function monthName(month: string, currentMonth: string): string {
  const long = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  return month.slice(0, 4) === currentMonth.slice(0, 4) ? long : `${long} ${month.slice(0, 4)}`;
}

/** The day a note was given: "9 Oct", or "9 Dec 2025" outside `currentMonth`'s year. */
export function kudosDay(day: string, currentMonth: string): string {
  const short = new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return day.slice(0, 4) === currentMonth.slice(0, 4) ? short : `${short} ${day.slice(0, 4)}`;
}

/** A note as written: spaces and line breaks collapsed, ends trimmed. */
export function cleanKudos(body: string): string {
  return body.replace(/\s+/g, " ").trim();
}

/**
 * The note tints, from the client palette: pink first, the card's own colour,
 * then blue, teal and amber, so neighbouring notes never share a tint.
 */
const NOTE_TONES = [3, 0, 5, 2] as const;
export function noteTone(index: number): number {
  return NOTE_TONES[index % NOTE_TONES.length];
}

type Recipient = { personId: string; name: string };

/**
 * Who the composer offers: the first few of an already shuffled list as faces,
 * and everyone as "Anyone else", by name. Never the giver, because a kudos to
 * yourself is refused by the table.
 */
export function kudosRecipients<P extends Recipient>(shuffled: P[], giverPersonId: string): { quick: P[]; everyone: P[] } {
  const others = shuffled.filter((p) => p.personId !== giverPersonId);
  return {
    quick: others.slice(0, QUICK_FACES),
    everyone: [...others].sort((a, b) => a.name.localeCompare(b.name, "en")),
  };
}

/**
 * The starters the Kudos page offers after the month's notes (TH.21): a
 * question that brings a teammate to mind, and the opening words it puts in
 * the composer. They nudge towards thanking, never towards anyone in
 * particular, and nothing records which one was picked.
 */
export const KUDOS_STARTERS = [
  { question: "Who unblocked you this week?", line: "Thanks for unblocking me on ", tone: 2 },
  { question: "Who taught you something new?", line: "Thanks for showing me how to ", tone: 4 },
  { question: "Who looked after a client well?", line: "Thanks for the way you looked after ", tone: 1 },
  { question: "Who covered for you?", line: "Thanks for covering for me when ", tone: 5 },
  { question: "Who made the office brighter?", line: "Thanks for brightening the office with ", tone: 0 },
  { question: "Whose small help saved your day?", line: "Thanks for the small thing that saved my day: ", tone: 3 },
] as const;

/**
 * How many starters follow `noteCount` notes: enough to fill the wall to six
 * tiles early in a month, and never fewer than two, so a full wall still ends
 * with an invitation.
 */
export function starterCount(noteCount: number): number {
  return Math.min(KUDOS_STARTERS.length, Math.max(2, 6 - noteCount));
}
