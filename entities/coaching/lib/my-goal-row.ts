import { ladderValue } from "./ladder";
import type { CoachingGoal, GoalComment } from "./types";

// One goal as the member's goals panel needs it, and the mapping from the
// loader's row onto it. Both /team/goals and the My FAST goal tab of
// /team/my-coaching render that panel, so the mapping lives in a plain module
// they both import rather than in either page — a second copy is how two
// screens drift apart (CLAUDE.md rule 3).
//
// It is NOT in the panel's own file because that file is "use client":
// importing a function from a client module into a server component hands back
// a client-reference proxy rather than the function (see lib/ladder.ts).

export type MyGoalRow = {
  id: string;
  title: string;
  descriptionMarkdown: string | null;
  stretchMarkdown: string | null;
  status: CoachingGoal["status"];
  quarterLabel: string | null;
  // Whether a letter exists and when it was sealed (L.10) — NOT the letter
  // itself. The goal card must be able to say "you wrote one" without being
  // able to show it, and a row that never carries the words cannot leak them.
  hasLetter: boolean;
  letterSealedOn: string | null;
  metricUnit: string | null;
  startValue: number | null;
  targetValue: number | null;
  currentValue: number | null;
  dueDate: string | null;
  ladderLabel: string | null;
  // The company goal this ladders to, as the picker encodes it ("kind:id"),
  // or "" for a goal that stands on its own.
  ladderValue: string;
  // False for goals someone else set for you: editable, but not yours to delete.
  canDelete: boolean;
  // The four FAST lines the card draws (K.62). The comments are the F, and they
  // travel with the goal rather than living in a section of their own, because
  // a discussion detached from what it is about is a discussion nobody opens.
  comments: GoalComment[];
  // How often the number moved this quarter, and when it last did. Facts about
  // the goal's upkeep, never about the person, and both hidden when empty.
  bumps: number;
  lastBumpAt: string | null;
  // Where the company key result this goal lifts currently stands ("1240 of
  // 2000 signups"). Null when it has no number, or is an objective.
  alignMeasure: string | null;
};

// The per-goal facts the card needs that the goal row itself does not carry:
// the audit trail's bump count and last stamp, and the company number behind
// the alignment label. Supplied by the route, which loads both in one read
// each for the whole tab.
export type MyGoalExtras = { bumps: number; lastBumpAt: string | null; alignMeasure: string | null };

const NO_EXTRAS: MyGoalExtras = { bumps: 0, lastBumpAt: null, alignMeasure: null };

export function toMyGoalRow(
  g: CoachingGoal,
  actorTeamMemberId: string,
  extras: MyGoalExtras = NO_EXTRAS,
): MyGoalRow {
  return {
    comments: g.comments,
    bumps: extras.bumps,
    lastBumpAt: extras.lastBumpAt,
    alignMeasure: extras.alignMeasure,
    id: g.id,
    title: g.title,
    descriptionMarkdown: g.descriptionMarkdown,
    stretchMarkdown: g.stretchMarkdown,
    status: g.status,
    quarterLabel: g.quarterLabel,
    hasLetter: Boolean(g.letterMd),
    letterSealedOn: g.letterSealedOn,
    metricUnit: g.metricUnit,
    startValue: g.startValue,
    targetValue: g.targetValue,
    currentValue: g.currentValue,
    dueDate: g.dueDate,
    ladderLabel: g.ladder?.label ?? null,
    ladderValue: ladderValue(g.ladder),
    // Delete is the author's alone. A goal set for you by a coach or manager is
    // theirs to remove; you can still edit it or drop it.
    canDelete: g.createdBy === actorTeamMemberId,
  };
}
