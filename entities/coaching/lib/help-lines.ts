import { diffDays } from "@/kernel/config/dates";
import { missWorthPrompting, type LeaveSpan } from "./leave-window";
import { rowState } from "./row-state";
import { describeDay } from "./cadence";
import { dayOnly, inDays } from "./help-words";

// The words the coach's roster says, and nothing else (K.46). Every sentence
// here is addressed to the coach and is about the work — a commitment, a
// meeting, a goal, a note — never about the person. Nothing counts flags per
// person, nothing ranks anybody, and there is no red state: a signal is an
// offer of help, which is why the list is called "Where I can help".
//
// It is pure so the whole vocabulary of the page can be read and tested
// without a database, and so the sort order is a fact with a test rather than
// a detail buried in JSX. The row sentences live beside the help lines because
// they are the same voice about the same facts, and a second file would be how
// the two drift apart.

export type HelpLine = {
  // Which signal produced the line. Carried on the line itself so a page
  // holding several people's lines can interleave them in the same order of
  // obligation, without knowing how that order is decided.
  signal: Signal;
  text: string;
  // The same sentence with the person's name taken out of it, for a list that
  // has already said whose line this is — the avatar and the name at the head
  // of the group (K.61). Read down a grouped list, "Sam proposed…" under a
  // heading that says Sam is the third time the page names one person in two
  // inches, and that repetition is a large part of what made the old list read
  // as a wall of prose. Both spellings are built here rather than one being
  // sliced out of the other, because a name is not always a prefix.
  underName: string;
  // Where the coach answers this line. A proposal and a missing time are
  // answered by controls that sit on the person's own row, so those lines point
  // at the row; everything else is answered on the person's profile.
  href: string;
};

// How far ahead an unwritten agenda becomes something worth saying. Two days
// is the last moment a coach can still do the reading before the meeting.
export const AGENDA_LEAD_DAYS = 2;

export type HelpInput = {
  profileId: string;
  name: string;
  // A date the member put forward that the coach has not answered yet.
  proposedOn: string | null;
  proposedBy: string | null;
  // The most recent booking whose day passed without the 1-1 happening.
  missedOn: string | null;
  // When this person was away (L.2); absent on callers that predate it.
  leave?: LeaveSpan[];
  // The day the oldest still-blocked commitment became blocked.
  stuckSince: string | null;
  hasGoal: boolean;
  nextOneOnOneOn: string | null;
  // The time that booking starts, null when nobody named one anywhere: not on
  // the booking, and not as a standing preference either.
  nextStartsAt: string | null;
  agendaWritten: boolean;
  // How many 1-1s have been held; with none and no date, the first one is the
  // thing to propose (Khoa, 2026-09-17: "if there is none, that should be shown").
  heldCount: number;
};

// The order the coach reads them in: first what somebody is waiting on the
// coach for, then what already went wrong, then what is stuck, then what was
// never started, then what is merely coming up. It is an order of obligation,
// not of severity, and it never depends on who the person is.
export const HELP_ORDER = ["proposal", "missed", "date", "time", "stuck", "goal", "agenda"] as const;
export type Signal = (typeof HELP_ORDER)[number];

// Where a line sits in that order, for a caller interleaving several people.
export function helpRank(signal: Signal): number {
  return HELP_ORDER.indexOf(signal);
}

export function helpLines(row: HelpInput, todayISO: string): HelpLine[] {
  const found: HelpLine[] = [];
  const profile = (tab: string) => `/team/coaching/${row.profileId}?tab=${tab}`;

  if (row.proposedOn && row.proposedBy === "member") {
    found.push({
      signal: "proposal",
      text: `${row.name} proposed ${describeDay(row.proposedOn)} — answer them.`,
      underName: `Proposed ${describeDay(row.proposedOn)} — answer them.`,
      href: `#roster-${row.profileId}`,
    });
  }
  // A 1-1 that did not happen because the person was away is a holiday, not a
  // signal (L.2). The roster is where a coach decides who needs something, so a
  // holiday appearing there as "did not happen" is the version of this bug that
  // actually causes a chase.
  if (row.missedOn && missWorthPrompting(row.missedOn, row.leave ?? [])) {
    found.push({
      signal: "missed",
      text: `Your 1-1 with ${row.name} on ${dayOnly(row.missedOn)} was not marked done — mark it done if you met, or rebook it.`,
      underName: `1-1 on ${dayOnly(row.missedOn)} was not marked done — mark it done if you met, or rebook it.`,
      href: profile("next"),
    });
  }
  // No date and nothing ever held: the first 1-1 has not been proposed. A
  // pending proposal (either side) already covers it, so it is not repeated.
  if (!row.nextOneOnOneOn && !row.proposedOn && row.heldCount === 0) {
    found.push({
      signal: "date",
      text: `${row.name} has no first 1-1 yet — propose a day.`,
      underName: "No first 1-1 yet — propose a day.",
      href: profile("next"),
    });
  }
  // A booking with no time on it, said as soon as the booking exists rather
  // than inside the agenda's two-day window: writing an agenda takes reading
  // and thinking, so asking three weeks out is noise, while a time is one click
  // and the member needs it in their calendar from the moment the day is set.
  // A day that has already passed is excluded — the missed line owns that row,
  // and a second sentence about the same meeting would just be noise.
  if (row.nextOneOnOneOn && !row.nextStartsAt && row.nextOneOnOneOn >= todayISO) {
    found.push({
      signal: "time",
      text: `Your 1-1 with ${row.name} on ${dayOnly(row.nextOneOnOneOn)} has no time on it — set one.`,
      underName: `1-1 on ${dayOnly(row.nextOneOnOneOn)} has no time on it — set one.`,
      href: `#roster-${row.profileId}`,
    });
  }
  if (row.stuckSince) {
    const days = Math.max(diffDays(row.stuckSince, todayISO), 0);
    found.push({
      signal: "stuck",
      text: `${row.name} has a commitment stuck ${days} ${days === 1 ? "day" : "days"} — ask what is in the way.`,
      underName: `Commitment stuck ${days} ${days === 1 ? "day" : "days"} — ask what is in the way.`,
      href: profile("next"),
    });
  }
  if (!row.hasGoal) {
    found.push({
      signal: "goal",
      text: `${row.name} has no FAST goal yet — shape one together.`,
      underName: NO_GOAL_NOTE,
      href: profile("goals"),
    });
  }
  const next = row.nextOneOnOneOn;
  if (next && !row.agendaWritten) {
    const away = diffDays(todayISO, next);
    if (away >= 0 && away <= AGENDA_LEAD_DAYS) {
      found.push({
        signal: "agenda",
        text: `Your 1-1 with ${row.name} is ${inDays(away)} and the agenda is still blank — write it.`,
        underName: `1-1 ${inDays(away)} and the agenda is still blank — write it.`,
        href: profile("next"),
      });
    }
  }

  return found.sort((a, b) => helpRank(a.signal) - helpRank(b.signal));
}

// ── The same lines, gathered under the person they belong to (K.61) ───────

// The one sentence about a goal that has never been written. It is a constant
// because three places say it — the help line, a row's goal sentence and the
// footer of the grouped list — and three copies is how three screens drift.
export const NO_GOAL_NOTE = "No FAST goal yet — shape one together.";

// How many people the list shows before it says where the rest are. Five is
// the K.59 cap, moved from lines to people: the cap exists so the block stays a
// shortlist a coach reads in one glance, and after grouping the thing a coach
// counts on it is faces, not sentences.
export const HELP_GROUPS_SHOWN = 5;

// The order people are read in. It is deliberately not quite the order one
// person's own lines are read in: inside a group "no FAST goal yet" comes
// before tomorrow's blank agenda because it is the older omission, but a person
// whose worst signal is a blank agenda still needs the coach before a person
// whose only signal is a goal that has never existed — the agenda has a date on
// it and the goal does not.
//
// This is a category, not a number. A person's place is decided by which single
// signal is their most urgent, and never by how many signals they have: a
// person with four lines does not outrank a person with one, because counting
// flags per person is exactly the metric that would describe a person rather
// than the work (CLAUDE.md).
export const GROUP_ORDER = ["proposal", "missed", "date", "stuck", "agenda", "time", "goal"] as const;

export function groupRank(signal: Signal): number {
  return GROUP_ORDER.indexOf(signal);
}

export type HelpGroupInput = HelpInput & { avatarUrl: string | null };

export type HelpGroup = {
  profileId: string;
  name: string;
  avatarUrl: string | null;
  // The signal that put this person where they are, so a caller can say why an
  // order is the order without recomputing it.
  topSignal: Signal;
  lines: HelpLine[];
};

export type HelpGroups = {
  // The people the block draws in full, capped at HELP_GROUPS_SHOWN.
  groups: HelpGroup[];
  // The people past the cap. They are never dropped in silence: each of them
  // still says the same thing on their own row, and the block links down to the
  // first of them.
  overflow: HelpGroup[];
  // Everybody whose only signal is a goal that was never written. One sentence
  // naming them all is the truthful weight of it: it is a standing invitation,
  // not something that has to happen this week, and five separate cards saying
  // it would crowd out the one date somebody is actually waiting on.
  noGoalOnly: { profileId: string; name: string; href: string }[];
  // How many people — not how many lines — the coach is needed by this week.
  // The footer people are not in it: they are an invitation, not a wait.
  peopleWaiting: number;
};

export function helpGroups(rows: HelpGroupInput[], todayISO: string): HelpGroups {
  const all = rows
    .map((row) => ({ row, lines: helpLines(row, todayISO) }))
    .filter(({ lines }) => lines.length > 0)
    .map(({ row, lines }) => ({
      profileId: row.profileId,
      name: row.name,
      avatarUrl: row.avatarUrl,
      // helpLines has already sorted the lines, and the person's own order puts
      // the most urgent first inside a group; the group's rank is read from the
      // whole set because that order and this one differ on goal vs agenda.
      topSignal: lines.reduce((worst, l) => (groupRank(l.signal) < groupRank(worst) ? l.signal : worst), lines[0].signal),
      lines,
    }));

  const noGoalOnly = all
    .filter((g) => g.topSignal === "goal")
    .map((g) => ({ profileId: g.profileId, name: g.name, href: g.lines[0].href }));

  // Array.prototype.sort is stable, so people the page owes the same kind of
  // answer keep the roster's own name order rather than an order nobody chose.
  const waiting = all
    .filter((g) => g.topSignal !== "goal")
    .sort((a, b) => groupRank(a.topSignal) - groupRank(b.topSignal));

  return {
    groups: waiting.slice(0, HELP_GROUPS_SHOWN),
    overflow: waiting.slice(HELP_GROUPS_SHOWN),
    noGoalOnly,
    peopleWaiting: waiting.length,
  };
}

// ── The sentences on a person's own row ───────────────────────────────────

// "Next 1-1: Tuesday 30 Sep · agenda drafted · in 3 days". A person the coach
// has never met reads the first-1-1 sentence instead, because a roster that
// prints a dash where a history would go tells the coach nothing they can act
// on (K.46).
//
// It reads the row's whole state rather than only its booking (G.8). Given
// just `nextOneOnOneOn` it answered "No next 1-1 booked yet — put one in." for
// a day the member had proposed, a day the coach had proposed, and a booking
// that had passed unheld — three sentences flatly contradicted by the row's
// own button a few pixels below. The scheduling facts are optional so the
// signature stays compatible with a caller that only has the booking; a row
// that passes them gets the truth.
export function nextMeetingLine(
  row: {
    nextOneOnOneOn: string | null;
    // When that booking starts, already resolved through meetingStartsAt. The
    // row says it out loud (K.71): a date with no hour beside it is the thing
    // a coach has to open another page to find out, and it is the same fact
    // the help list above is willing to call missing.
    startsAt?: string | null;
    agendaWritten: boolean;
    heldCount: number;
    proposedOn?: string | null;
    proposedBy?: string | null;
    missedOn?: string | null;
    missedMeetingId?: string | null;
    suggestedOn?: string | null;
    leave?: LeaveSpan[];
  },
  todayISO: string,
): string {
  const state = rowState({
    proposedOn: row.proposedOn ?? null,
    proposedBy: row.proposedBy ?? null,
    nextOneOnOneOn: row.nextOneOnOneOn,
    agendaWritten: row.agendaWritten,
    missedOn: row.missedOn ?? null,
    missedMeetingId: row.missedMeetingId ?? null,
    everMet: row.heldCount > 0,
    suggestedOn: row.suggestedOn ?? null,
    leave: row.leave,
  });

  switch (state.kind) {
    // The same fact the help list states, in the row's own voice: the list
    // names the person because it interleaves several, and the row does not
    // because the name is already its heading.
    case "member-proposed":
      return `They proposed ${describeDay(state.on)} — answer them.`;
    case "missed":
      return state.worthPrompting
        ? `The 1-1 on ${dayOnly(state.on)} was not marked done — mark it done if you met, or rebook it.`
        : `The 1-1 on ${dayOnly(state.on)} fell in their time off — put a new day in.`;
    case "booked": {
      // The hour rides with the day rather than taking a slot of its own in the
      // list, because "Wednesday 23 Sep at 15:00" is one fact about when, and
      // splitting it would make the row read as four things instead of three.
      const day = `${describeDay(state.on)}${row.startsAt ? ` at ${row.startsAt}` : ""}`;
      if (!state.everMet) return `First 1-1 on ${day} — pick a preferred slot together.`;
      const agenda = state.agendaWritten ? "agenda drafted" : "agenda not written yet";
      return `Next 1-1: ${day} · ${agenda} · ${inDays(diffDays(todayISO, state.on))}`;
    }
    // The coach has asked and nobody is blocked on them, so the sentence says
    // who it is with rather than asking for a day that is already offered.
    case "coach-proposed":
      return `You proposed ${describeDay(state.on)} — waiting on them.`;
    // A suggestion sits beside "Nothing booked", never phrased as a booking (ADR-0010).
    case "none":
      if (!state.everMet) return "No first 1-1 booked yet — pick a day together.";
      return state.suggestedOn
        ? `Nothing booked · ${describeDay(state.suggestedOn)} keeps the rhythm.`
        : "Nothing booked yet — put one in.";
  }
}

export type RosterChangeFacts = {
  kept: number;
  stuck: number;
  notes: number;
  cardsDone: number;
};

// What moved since the 1-1 the coach actually held, as the parts the roster
// row's right-hand column holds (K.58). It replaced the sentence that used to
// say the same thing: the row said all four of its facts in prose of nearly
// identical weight, which is why ten rows read as a wall of grey and nothing on
// a row had a shape (doc §A.15). The cluster gives the row its second column
// without adding a single status chip or colour — the eyebrow says when, the
// phrases say what moved.
//
// Like every number on this page these count work — commitments, notes, board
// cards — and none of them is ever used to sort or rank the people they belong
// to (CLAUDE.md). A phrase that would be zero is left out rather than printed,
// because a column of zeroes is a scorecard by another route.
export type SinceCluster = {
  // "Since 12 Sep", or "No 1-1 yet" when there is nothing to look back on.
  eyebrow: string;
  // Two to four short phrases, longest-lived first. Empty when nothing moved.
  items: string[];
  // The line printed in place of the phrases when `items` is empty, so the
  // column keeps its shape instead of collapsing (WIG §Content Handling).
  note: string | null;
};

export function sinceCluster(
  lastHeldOn: string | null,
  change: RosterChangeFacts,
  todayISO: string,
): SinceCluster {
  if (!lastHeldOn) {
    return { eyebrow: "No 1-1 yet", items: [], note: "Their first one is the start of it." };
  }
  const items: string[] = [];
  if (change.kept > 0) items.push(`${change.kept} kept`);
  if (change.stuck > 0) items.push(`${change.stuck} stuck`);
  if (change.cardsDone > 0) items.push(`${change.cardsDone} card${change.cardsDone === 1 ? "" : "s"} done`);
  if (change.notes > 0) items.push(`${change.notes} note${change.notes === 1 ? "" : "s"} written`);
  const eyebrow = `Since ${dayOnly(lastHeldOn)}`;
  if (items.length > 0) return { eyebrow, items, note: null };
  // The same split the sentence makes: a 1-1 held today has had no time to show
  // anything, and only a day or more of silence is worth asking about.
  const quiet = diffDays(lastHeldOn, todayISO);
  return { eyebrow, items: [], note: quiet > 0 ? "Nothing has moved." : "Nothing yet." };
}
