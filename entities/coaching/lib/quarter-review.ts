// The pure half of the quarter in review (K.26, spec §K.26): one quarter of a
// member's coaching, assembled from rows the loader already has. Everything
// here is a function of plain values, so the quarter's bounds, what fell inside
// them and the small kept-out-of-made chart are all testable without a database
// or a browser.
//
// The page it feeds is meant to be worth keeping (K.30.5), which is why the
// builder returns sentences and geometry rather than raw rows: the route draws
// an inline SVG from `bars`, and nothing on the page is a figure about a
// person — every count is a count of that quarter's commitment cards.

import { firstSentence } from "./history-shared";
import type { GoalStatus } from "./types";

export const QUARTER_PATTERN = /^\d{4}-Q[1-4]$/;

export type QuarterReviewInputGoal = {
  title: string;
  status: GoalStatus;
  quarterLabel: string | null;
  descriptionMarkdown: string | null;
};

export type QuarterReviewInputMeeting = {
  id: string;
  heldOn: string;
  sharedSummaryMarkdown: string | null;
  made: number;
  kept: number;
};

export type QuarterReviewInputNote = { on: string; body: string };

export type QuarterReviewGoal = {
  title: string;
  status: GoalStatus;
  // How it ended, as a sentence rather than a badge: this page is read months
  // later, when "dropped" on its own has lost the context it had at the time.
  ending: string;
  descriptionMarkdown: string | null;
};

export type QuarterReviewMeeting = {
  id: string;
  heldOn: string;
  made: number;
  kept: number;
  // The first line of the published recap, empty when none was shared.
  recapLine: string;
};

// One bar of the inline chart, already in the 0..1 space the route scales into
// SVG coordinates. A meeting with nothing committed has no bar rather than an
// empty one, because a full-height zero reads as a claim (the same rule as the
// History heatmap).
export type QuarterReviewBar = { id: string; heldOn: string; made: number; kept: number; ratio: number };

export type QuarterReview = {
  quarter: string;
  // "Q3 2026", the heading.
  heading: string;
  from: string;
  to: string;
  goals: QuarterReviewGoal[];
  meetings: QuarterReviewMeeting[];
  notes: QuarterReviewInputNote[];
  bars: QuarterReviewBar[];
  kept: number;
  made: number;
  // True when the quarter holds no 1-1, no goal and no note: the page still
  // renders, and says so, rather than showing three empty cards.
  empty: boolean;
};

const ENDINGS: Record<GoalStatus, string> = {
  draft: "Still a draft at the end of the quarter.",
  active: "Still running.",
  achieved: "Reached.",
  dropped: "Dropped during the quarter.",
};

// The first and last day of a quarter, inclusive, as YYYY-MM-DD. Null for
// anything that is not a quarter label, which is how the route decides to
// answer notFound rather than rendering an empty page for a typed URL.
export function quarterBounds(quarter: string): { from: string; to: string } | null {
  if (!QUARTER_PATTERN.test(quarter)) return null;
  const year = quarter.slice(0, 4);
  const q = Number(quarter.slice(6));
  const firstMonth = (q - 1) * 3 + 1;
  const lastMonth = firstMonth + 2;
  // A quarter always ends in March, June, September or December, so the leap
  // year never comes into it: only the thirty-day months need naming.
  const lastDay = lastMonth === 6 || lastMonth === 9 ? 30 : 31;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { from: `${year}-${pad(firstMonth)}-01`, to: `${year}-${pad(lastMonth)}-${pad(lastDay)}` };
}

// The quarters a member has a review worth opening for: those with at least one
// held 1-1, newest first. History links to exactly these.
export function quartersWithMeetings(meetings: { heldOn: string }[]): string[] {
  const seen = new Set<string>();
  for (const m of meetings) {
    if (!m.heldOn) continue;
    const q = `${m.heldOn.slice(0, 4)}-Q${Math.floor((Number(m.heldOn.slice(5, 7)) - 1) / 3) + 1}`;
    seen.add(q);
  }
  return [...seen].sort().reverse();
}

export function buildQuarterReview(input: {
  quarter: string;
  goals: QuarterReviewInputGoal[];
  meetings: QuarterReviewInputMeeting[];
  notes: QuarterReviewInputNote[];
}): QuarterReview | null {
  const bounds = quarterBounds(input.quarter);
  if (!bounds) return null;
  const inside = (day: string) => day >= bounds.from && day <= bounds.to;

  // A goal belongs to the quarter it was filed under; a goal with no label
  // falls outside every quarter rather than into all of them.
  const goals = input.goals
    .filter((g) => g.quarterLabel === input.quarter)
    .map((g) => ({
      title: g.title,
      status: g.status,
      ending: ENDINGS[g.status],
      descriptionMarkdown: g.descriptionMarkdown,
    }));

  // Oldest first: the quarter reads forwards, the way it was lived.
  const meetings = [...input.meetings]
    .filter((m) => inside(m.heldOn))
    .sort((a, b) => a.heldOn.localeCompare(b.heldOn))
    .map((m) => ({
      id: m.id,
      heldOn: m.heldOn,
      made: m.made,
      kept: m.kept,
      recapLine: firstSentence(m.sharedSummaryMarkdown),
    }));

  const notes = input.notes.filter((n) => inside(n.on)).sort((a, b) => a.on.localeCompare(b.on));

  const bars = meetings
    .filter((m) => m.made > 0)
    .map((m) => ({
      id: m.id,
      heldOn: m.heldOn,
      made: m.made,
      kept: m.kept,
      ratio: Math.min(1, m.kept / m.made),
    }));

  return {
    quarter: input.quarter,
    heading: `${input.quarter.slice(5)} ${input.quarter.slice(0, 4)}`,
    from: bounds.from,
    to: bounds.to,
    goals,
    meetings,
    notes,
    bars,
    kept: meetings.reduce((n, m) => n + m.kept, 0),
    made: meetings.reduce((n, m) => n + m.made, 0),
    empty: goals.length === 0 && meetings.length === 0 && notes.length === 0,
  };
}
