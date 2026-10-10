// The coaching module's client-safe vocabulary (ME-11): the status enums,
// their labels and the goal/ladder shapes that the coaching UI, the member's
// goals panel and the admin goals editor render. They live apart from data.ts
// because that file reaches the company-os door — a server-only barrel — for
// the board link, and a client component importing data.ts for a label would
// drag that barrel into its bundle. data.ts re-exports everything here, so its
// server callers keep one import.

export type GoalStatus = "draft" | "active" | "achieved" | "dropped";
export type PriorityStatus = "active" | "retired";
export type RetentionRoot = "belonging" | "links" | "sacrifice" | "watching";
export type OneOnOneStatus = "scheduled" | "held" | "skipped";
export type CommitmentOwner = "coach" | "member";

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  draft: "Draft",
  active: "Active",
  achieved: "Achieved",
  dropped: "Dropped",
};

export const RETENTION_ROOT_LABELS: Record<RetentionRoot, string> = {
  belonging: "Belonging (fit)",
  links: "Links",
  sacrifice: "Sacrifice",
  watching: "Watching",
};

// The language the SHARED recap tier is written in. Null (the profile column's
// default) means the summariser follows the transcript, which is right until a
// member's 1-1s are mixed enough that the model guesses wrong; then the coach
// pins one.
export type RecapLanguage = "vi" | "en";

export const RECAP_LANGUAGE_LABELS: Record<RecapLanguage, string> = {
  vi: "Vietnamese",
  en: "English",
};
export type CommitmentStatus =
  | "open"
  | "on_track"
  | "needs_attention"
  | "completed"
  | "dropped"
  | "blocked";

export const OPEN_COMMITMENT_STATUSES: CommitmentStatus[] = [
  "open",
  "on_track",
  "needs_attention",
  "blocked",
];

export const COMMITMENT_STATUS_LABELS: Record<CommitmentStatus, string> = {
  open: "Open",
  on_track: "On track",
  needs_attention: "Needs attention",
  completed: "Completed",
  dropped: "Dropped",
  blocked: "Blocked",
};

// The commitment board's three working columns (K.14, spec 2.2 and 8.1). The
// status vocabulary above is older and finer than the board, so the board maps
// onto it rather than replacing it: open and needs_attention are both "someone
// is on it", and dropped is not on the board at all.
export type BoardColumnId = "on_it" | "blocked" | "done";

export const BOARD_COLUMN_LABELS: Record<BoardColumnId, string> = {
  on_it: "On it",
  blocked: "Stuck",
  done: "Done",
};

// The status a card takes when it is dropped into a column. The reverse of
// columnFor, and deliberately lossy: a card moved back to On it becomes
// on_track, never open or needs_attention.
export const STATUS_FOR_COLUMN: Record<BoardColumnId, CommitmentStatus> = {
  on_it: "on_track",
  blocked: "blocked",
  done: "completed",
};

// Which column a commitment sits in, or null when it is off the board.
export function columnFor(status: CommitmentStatus): BoardColumnId | null {
  switch (status) {
    case "open":
    case "on_track":
    case "needs_attention":
      return "on_it";
    case "blocked":
      return "blocked";
    case "completed":
      return "done";
    case "dropped":
      return null;
  }
}

export type EdgesLadder =
  | { kind: "objective"; id: string; label: string }
  | { kind: "key_result"; id: string; label: string };

export type GoalComment = {
  id: string;
  goalId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type CoachingGoal = {
  id: string;
  title: string;
  descriptionMarkdown: string | null;
  status: GoalStatus;
  quarterLabel: string | null;
  // Two sentences the member wrote to their end-of-quarter self (L.10). Present
  // on the row but SEALED: letterIsOpen decides where it may be rendered, and
  // everywhere but that quarter's own review page the answer is no.
  letterMd: string | null;
  letterSealedOn: string | null;
  ladder: EdgesLadder | null;
  comments: GoalComment[];
  // The member-authored measure (/team/goals). Null on goals that carry no
  // number of their own.
  metricUnit: string | null;
  startValue: number | null;
  targetValue: number | null;
  currentValue: number | null;
  dueDate: string | null;
  // "What would doubling it look like" — the Ambitious check on the goal form.
  // Null on goals saved before the question existed, or saved without it.
  stretchMarkdown: string | null;
  // The team member who wrote the goal, null on goals set by a coach or
  // predating authorship. Only the author may delete it.
  createdBy: string | null;
};

// Everything the ladder picker offers: the company objectives and their key
// results. Both tables are small.
// `code` is the number Company Goals shows (O2, KR2.4), set only on this year's
// active company objectives and their key results, in display order. The
// objectives with no code are still here so a goal laddered to a past year's
// key result keeps its label; the picker offers only the coded ones (K.76).
export type EdgesOptions = {
  objectives: { id: string; label: string; code: string | null }[];
  keyResults: { id: string; label: string; objectiveId: string | null; code: string | null }[];
};

// Ladder input from the picker: at most one Edges target.
export type LadderInput =
  | { kind: "none" }
  | { kind: "objective" | "key_result"; id: string };

export type AdminMemberGoals = {
  teamMemberId: string;
  name: string;
  goals: CoachingGoal[];
};

export const OCEAN_DIMENSIONS = [
  "openness",
  "conscientiousness",
  "extraversion",
  "agreeableness",
  "neuroticism",
] as const;
export type OceanDimensionKey = (typeof OCEAN_DIMENSIONS)[number];

/**
 * The check-in row that belongs to the UPCOMING 1-1, out of every row on the
 * profile (newest first). The cycle it belongs to is the window between the
 * last held 1-1 and the next one: a row stamped inside it is this cycle's form,
 * and anything older belongs to a cycle already had. With no next date the
 * newest row after the last 1-1 is the only candidate there can be.
 */
export function currentCycleCheckin<T extends { sentAt: string }>(
  rows: T[],
  lastHeldOn: string | null,
  nextOn: string | null,
): T | null {
  return (
    rows.find((c) => {
      const day = c.sentAt.slice(0, 10);
      if (lastHeldOn && day < lastHeldOn) return false;
      if (nextOn && day > nextOn) return false;
      return true;
    }) ?? null
  );
}

// The three fields the member fills in the ninety seconds before a 1-1, plus
// what they wrote last time and the coach's note back (K.15, spec 2.3). All
// three are optional: the meeting covers the headings either way, so an empty
// form is a form, not a gap.
export type PreMeetingAnswers = { moved: string; stuck: string; talk: string };

export type PreMeeting = {
  answers: PreMeetingAnswers;
  // The previous cycle's answers, or null when this is the first form.
  previous: PreMeetingAnswers | null;
  coachNote: string | null;
};


const trimmed = (v: string | null): string => (v ?? "").trim();

// The shape the builder needs off a check-in row, named here so the pure
// builder never has to reach into a data file for a type.
export type PreMeetingRow = {
  id: string;
  sentAt: string;
  moved: string | null;
  stuck: string | null;
  talk: string | null;
  coachNote: string | null;
};

const answersOf = (c: PreMeetingRow): PreMeetingAnswers => ({
  moved: trimmed(c.moved),
  stuck: trimmed(c.stuck),
  talk: trimmed(c.talk),
});

const hasAnswer = (a: PreMeetingAnswers): boolean => Boolean(a.moved || a.stuck || a.talk);


/**
 * The pre-meeting block the member's page renders: this cycle's answers, the
 * newest EARLIER answers as "last time you wrote", and the coach's note. The
 * recall deliberately skips a cycle nobody filled in, because "last time" means
 * the last time they wrote something, not the last row that exists.
 */
export function buildPreMeeting<T extends PreMeetingRow>(
  checkins: T[],
  lastHeldOn: string | null,
  nextOn: string | null,
): PreMeeting {
  const current = currentCycleCheckin(checkins, lastHeldOn, nextOn);
  const previous =
    checkins
      .filter((c) => c.id !== current?.id)
      .map(answersOf)
      .find(hasAnswer) ?? null;
  return {
    answers: current ? answersOf(current) : { moved: "", stuck: "", talk: "" },
    previous,
    coachNote: trimmed(current?.coachNote ?? null) || null,
  };
}
