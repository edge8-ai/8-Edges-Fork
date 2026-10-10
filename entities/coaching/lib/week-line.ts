import { isoWeekKey } from "@/kernel/config/dates";

// The one quiet line under "Coaching" that describes the coach's week (K.47):
// "2 conversations booked this week · 1 date waiting on you · 3 commitments kept since the last round".
// A count never sits next to "1-1": "1 1-1 this week" read as "11-1" (Khoa, 2026-09-17).
//
// It is an aggregate over the whole roster and it never names anybody, because
// a header that named a person would be a ranking of the roster by whoever is
// most trouble this week. Every clause counts work — meetings, dates, kept
// commitments — and a clause that would read zero is left out rather than
// printed, since "0 dates to confirm" is noise the coach has to parse before
// discarding.
//
// Pure, so the sentence can be read and tested without a database, and so the
// roster page stays markup.

export type WeekLineInput = {
  // The day the next 1-1 with this person sits on, if one is booked.
  nextOneOnOneOn: string | null;
  // A date somebody put forward that the coach has not answered yet, and who
  // put it forward — only a member's proposal is waiting on the coach.
  proposedOn: string | null;
  proposedBy: string | null;
  // Commitments this person kept since their own last held 1-1.
  kept: number;
};

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function weekLine(rows: WeekLineInput[], todayISO: string): string {
  if (rows.length === 0) return "Nobody on your roster yet";

  const week = isoWeekKey(todayISO);
  // The ISO week that holds today, Monday to Sunday — "this week" as a person
  // reading a calendar means it, including the days of it already gone.
  const meetings = rows.filter((r) => r.nextOneOnOneOn && isoWeekKey(r.nextOneOnOneOn) === week).length;
  const toConfirm = rows.filter((r) => r.proposedOn && r.proposedBy === "member").length;
  const kept = rows.reduce((sum, r) => sum + Math.max(r.kept, 0), 0);

  const clauses: string[] = [];
  if (meetings > 0) clauses.push(`${plural(meetings, "conversation")} booked this week`);
  if (toConfirm > 0) clauses.push(`${plural(toConfirm, "date")} waiting on you`);
  if (kept > 0) clauses.push(`${plural(kept, "commitment")} kept since the last round`);

  // A roster with nothing on it this week still gets a sentence rather than an
  // empty strip: the absence is itself the news a coach came to the page for.
  if (clauses.length === 0) return "Nothing booked this week, and nothing waiting on you";
  return clauses.join(" · ");
}
