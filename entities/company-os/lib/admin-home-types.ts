// The Admin Home's shapes (AH.2, redrawn in AH.4): what the route hands
// lib/admin-home.ts and what it hands the UI back. Kept apart from the wording
// so each file stays small enough to read in one go.

/** A read that either came back or failed; a section the reader may not see is left undefined. */
export type Loaded<T> = { ok: true; value: T } | { ok: false };

export type Tone = "err" | "warn" | "neutral"; // kernel/ui/Badge's tones
export type HomeBadge = { text: string; tone: Tone };

/**
 * What a row's buttons act on (AH.5): plain values the route read, which the
 * row's buttons hand to the owner's action. A row has one only when the reader
 * may take that action; otherwise it is a link, as before.
 */
export type RowAct =
  | { kind: "claim"; stage: "check" | "approve"; claimId: string; mark: { submittedAt: string; totalVnd: number } }
  | { kind: "draft"; campaignId: string; version: string }
  | { kind: "card"; taskId: string; due: string | null; today: string }
  | { kind: "deal"; dealId: string; nextStep: string | null; nextStepDate: string; today: string }
  | { kind: "probation"; teamMemberId: string };

export type HomeRow = {
  key: string;
  title: string;
  sub: string | null;
  href: string | null;
  badge: HomeBadge | null;
  /** A button on the row, for an item the reader acts on (write, decide). */
  action: string | null;
  /** Two-letter monogram for a person row; null for anything else. */
  initials: string | null;
  /** The buttons that act in place; null for a row that only links. */
  act: RowAct | null;
  /** A folded group's own rows, each with its buttons (AH.5); null for a plain row. */
  children: HomeRow[] | null;
};
export type HomeLink = { label: string; href: string };

export type Section<T> = { failed: true } | ({ failed: false } & T);

/** One day on the week strip and what happens on it. */
export type WeekDay = { date: string; label: string; today: boolean; events: { key: string; text: string }[] };

export type AdminHomeModel = {
  eyebrow: string;
  greeting: string;
  summary: string;
  /** Due today, and only the reader can do it: a probation decision, a card, a deal's next step. */
  first: HomeRow[];
  /** Approvals (several of one kind fold into one row), then the reviews the reader writes. */
  waiting: Section<{ rows: HomeRow[]; note: string | null }> | null;
  cards: Section<{
    myWeekHref: string;
    note: string;
    late: HomeRow[];
    lateCount: number;
    due: HomeRow[];
    dueCount: number;
    more: HomeLink | null;
    quiet: string | null;
    /** A nudge when several late cards are low priority: re-plan them rather than carry them. */
    hint: HomeLink | null;
  }> | null;
  deals: Section<{ href: string; note: string; rows: HomeRow[]; more: string | null }> | null;
  /** The next fortnight's company dates, with the counts that are links rather than lists. */
  week: Section<{ href: string | null; days: WeekDay[]; links: { label: string; href: string | null }[] }> | null;
  company: Section<{ href: string; rows: { label: string; value: string }[] }> | null;
};

// ── Inputs: plain shapes, so this entity's library names no other entity ──

export type ApprovalIn = {
  id: string;
  label: string;
  kind: string;
  askedAgo: string;
  href: string;
  /** What the reader can do here, and the amount a claim comes to; absent when they can only open it. */
  act?: RowAct | null;
  amount?: string | null;
};
export type ReviewIn = {
  id: string;
  subjectName: string;
  /** "Probation review", "Renewal review", … */
  typeLabel: string;
  self: boolean;
  /** A manager writing about a report, as opposed to a reviewer giving feedback. */
  manager: boolean;
  draft: boolean;
  href: string;
};
export type CardIn = { id: string; title: string; place: string; priority: string; due: string | null; href: string | null; act?: RowAct | null };
export type PromiseIn = { id: string; title: string; dueOn: string | null; personName: string | null; blocked: boolean };
export type DealIn = { id: string; title: string; stage: string | null; amountUsdCents: number | null; nextStep: string | null; nextStepDate: string };
export type AwayIn = { personId: string; name: string; start: string; end: string };
export type ProbationIn = { teamMemberId: string; name: string; startDate: string | null; endsOn: string | null; managerName: string | null };
export type HolidayIn = { date: string; name: string; closed: boolean };
export type VitalsIn = { cash30: number; openPipeline: number; headcount: number; openIssues: number };

export type AdminHomeInput = {
  /** Saigon's date, YYYY-MM-DD. */
  today: string;
  /** Saigon's hour, 0–23, for the greeting. */
  hour: number;
  /** The word greetingName chose to greet the reader by, or null for none. */
  addressedAs: string | null;
  /** My Week's sprint label ("W44") and whether today is its last day; null for an admin with no team membership. */
  sprint: { label: string; lastDay: boolean } | null;
  approvals?: Loaded<ApprovalIn[]>;
  reviews?: Loaded<ReviewIn[]>;
  cards?: Loaded<{ overdue: CardIn[]; due: CardIn[]; laterNext: CardIn | null; myWeekHref: string }>;
  promises?: Loaded<{ rows: PromiseIn[]; href: string }>;
  deals?: Loaded<{ rows: DealIn[]; href: (id: string) => string; pipelineHref: string; canLog?: boolean }>;
  team?: {
    href: string | null;
    /** Where a probation is decided; set only when the reader may open it. */
    probationHref?: string | null;
    /** The reader may decide a probation from Home (onboarding.manage). */
    canDecide?: boolean;
    away?: Loaded<AwayIn[]>;
    probation?: Loaded<ProbationIn[]>;
    holidays?: Loaded<HolidayIn[]>;
    applications?: Loaded<{ count: number; newest: string | null; href: string }>;
  };
  company?: Loaded<VitalsIn> & { href?: string };
};
