// The Admin Home's shapes (AH.2): what the route hands lib/admin-home.ts and
// what it hands the UI back. Kept apart from the wording so each file stays
// small enough to read in one go.

/** A read that either came back or failed; a section the reader may not see is left undefined. */
export type Loaded<T> = { ok: true; value: T } | { ok: false };

export type Tone = "err" | "warn" | "neutral"; // kernel/ui/Badge's tones
export type HomeBadge = { text: string; tone: Tone };
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
};
export type HomeLink = { label: string; href: string };
export type HomeTile = { label: string; value: string; note: string; href: string };

export type Section<T> = { failed: true } | ({ failed: false } & T);

export type AdminHomeModel = {
  eyebrow: string;
  greeting: string;
  summary: string;
  tiles: HomeTile[];
  waiting: Section<{ rows: HomeRow[] }> | null;
  cards: Section<{
    myWeekHref: string;
    overdue: HomeRow[];
    overdueCount: number;
    overdueMore: HomeLink | null;
    due: HomeRow[];
    dueCount: number;
    dueMore: HomeLink | null;
    dueQuiet: string | null;
  }> | null;
  promises: Section<{ href: string; heading: string; headingCount: number; late: boolean; rows: HomeRow[]; more: HomeLink | null }> | null;
  deals: Section<{ href: string; rows: HomeRow[]; more: string | null }> | null;
  team: Section<{ href: string | null; groups: { label: string; rows: HomeRow[] }[] }> | null;
  company: Section<{ href: string; rows: { label: string; value: string }[] }> | null;
};

// ── Inputs: plain shapes, so this entity's library names no other entity ──

export type ApprovalIn = { id: string; label: string; kind: string; askedAgo: string; href: string };
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
export type CardIn = { id: string; title: string; place: string; priority: string; due: string | null; href: string | null };
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
  deals?: Loaded<{ rows: DealIn[]; href: (id: string) => string; pipelineHref: string }>;
  team?: {
    href: string | null;
    away?: Loaded<AwayIn[]>;
    probation?: Loaded<ProbationIn[]>;
    holidays?: Loaded<HolidayIn[]>;
    applications?: Loaded<{ count: number; newest: string | null; href: string }>;
  };
  company?: Loaded<VitalsIn> & { href?: string };
};
