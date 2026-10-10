// Shared, framework-agnostic constants + types for Task Boards.
// Safe to import from server and client components (no server-only deps).
// Data lives in company_os.boards / board_columns / board_members / sprints /
// tasks / task_stage_log. Admin manages boards; team members see boards they
// belong to; a client sees the board linked to their company (read-only).

export const TASK_PRIORITIES = ["p1", "p2", "p3"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  p1: "P1",
  p2: "P2",
  p3: "P3",
};

// Tone maps onto the shared <Badge> component (ok/warn/err/info/neutral).
export const PRIORITY_TONE: Record<TaskPriority, "err" | "warn" | "neutral"> = {
  p1: "err",
  p2: "warn",
  p3: "neutral",
};

// A card is open, done, or closed without being done: Not Doing (2026-09-24),
// the fifth stage after Done. The status follows the column the card sits in
// (columnStatus below), so a reader asking "is this still work?" asks for
// "open", never for "not done", which would count the Not Doing cards.
export const TASK_STATUSES = ["open", "done", "not_doing"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const BOARD_STATUSES = ["active", "archived"] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];

export const SPRINT_STATUSES = ["active", "closed"] as const;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];

export const EPIC_STATUSES = ["active", "archived"] as const;
export type EpicStatus = (typeof EPIC_STATUSES)[number];

// Epic accent colors: the fixed on-palette set (values mirror lib/admin/stageColors,
// the single source for board accents). New epics cycle through these by sort
// order; the manage drawer can recolor. A null epics.color falls back to the first.
// An epic's colour is CATEGORICAL — it says which feature, never how urgent —
// and it is drawn ON A CARD, as a dot and as the card's left edge. That is
// exactly where the colour hierarchy reserves --admin-err and --admin-warn
// for overdue, blocked and aging, so no slot may take one
// (docs/engineering/admin-consistency-playbook.md, "Rule 5's scope": the
// reservation binds the card, not the chrome, which is why a lane accent
// may still be amber and an epic may not). Slot 3 was
// --admin-warn-strong until 2026-09-20, which put an amber edge on four live
// epics across two boards — one of them a client board, where it sat beside the
// amber aging clock meaning something entirely different. It is pink now: a hue
// this palette already used before slot 2 became near-black, outside both the
// warn and err families.
//
// Slot 2 was near-black (--admin-chart-4) until W.113: on a white card a black
// edge read as a heavier border rather than as a domain, and it was the one
// slot with no hue at all. It is teal now, the hue the 2026-09-04 token pass
// folded into mint only because no teal token existed then. Measured as
// CIEDE2000 it sits 19 from the green and 34 from the nearest warn colour;
// brown and orange were closer than 11 to amber and red, so neither was a
// candidate.
export const EPIC_COLORS = [
  "var(--admin-accent)", // brand blue
  "var(--admin-ok-strong)", // green
  "var(--color-client-5-ink)", // teal (was near-black)
  "var(--color-pink-ink)", // pink (was amber, which the status rule reserves)
  "var(--admin-chart-2)", // mint
  "var(--color-violet)", // violet
  "var(--admin-muted)", // slate
] as const;

/**
 * Colours an epic row may still hold from an earlier palette, and the slot
 * each now means. `epics.color` stores the token string, so retiring a string
 * from EPIC_COLORS would otherwise turn every epic that saved it brand blue.
 * Aliasing on read keeps the epic in its slot with no data migration. The row
 * keeps the old string until someone picks a colour for that epic, because
 * updateEpic writes the colour only when one is picked and every swatch sends
 * a current string.
 */
const LEGACY_EPIC_COLORS: Record<string, (typeof EPIC_COLORS)[number]> = {
  "var(--admin-chart-4)": EPIC_COLORS[2],
};

export function epicColor(color: string | null | undefined): string {
  if (!color) return EPIC_COLORS[0];
  if (EPIC_COLORS.includes(color as (typeof EPIC_COLORS)[number])) return color;
  return LEGACY_EPIC_COLORS[color] ?? EPIC_COLORS[0];
}

/**
 * The palette index of an epic's colour, for the `data-epic-color` attribute
 * the dot, chip and swatch classes in admin.css paint from — so no board
 * surface needs an inline style for a colour that is always one of the tokens.
 */
export function epicColorIndex(color: string | null | undefined): number {
  return EPIC_COLORS.indexOf(epicColor(color) as (typeof EPIC_COLORS)[number]);
}

// The link slot (tasks.subject_type). One link per card: a coaching commitment,
// a client roadmap item or a contractor work request, never two.
export const SUBJECT_COMMITMENT = "coaching_commitment";
export const SUBJECT_BACKLOG_ITEM = "client_backlog_item";
// The portal opens these on the Contractors board; moving one to Done asks
// the contractor for their hours before the card lands (useWorkboardDrag).
export const SUBJECT_CONTRACTOR_WORK = "contractor_work_request";

// metadata.source for cards filed by a scheduled routine (they get an AGENT badge).
export const SOURCE_AGENT = "agent";

// A card sitting in one column longer than this shows an amber "aging" clock.
export const AGING_DAYS = 7;

// A card assigned to the viewer within this window wears a "New" chip.
// metadata.assigned_at is stamped on (re)assignment; older cards predate the
// stamp, so created_at is the fallback.
export const NEW_ASSIGNMENT_DAYS = 3;

// "Bảo Lâm" -> "BL", for the avatar chips.
// Kept as a re-export: board components import `initials` from here.
export { initials } from "@/kernel/ui/format";

export function assignedAt(card: { metadata: Record<string, unknown>; created_at: string }): string {
  const stamped = card.metadata?.["assigned_at"];
  return typeof stamped === "string" ? stamped : card.created_at;
}

// The related pull request and its short build summary, both kept as loose keys
// on tasks.metadata (manual for now; a card can be linked to one PR).
export function cardPrUrl(card: { metadata: Record<string, unknown> }): string {
  const v = card.metadata?.["pr_url"];
  return typeof v === "string" ? v : "";
}
/**
 * Which pull request a link names, as "owner/repo#number"
 * ("edge8-ai/edge8-web#1781"), lowercased. The owner is part of the key because
 * one repo name can live under two real owners (B10: payroll-training-au is
 * tracked under two), and a PR number both reach must not stamp one repo's
 * title and state onto the other's cards. A renamed owner is folded into its
 * current name through PR_OWNER_ALIASES, so a card linked before the
 * talentedgeai to edge8-ai rename still names the PR GitHub now reports. Null
 * for anything that is not a GitHub pull request link.
 */
const PR_OWNER_ALIASES: Record<string, string> = { talentedgeai: "edge8-ai" };
const PR_LINK = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#]|$)/i;
export function prKey(url: string): string | null {
  const m = PR_LINK.exec(url.trim());
  if (!m) return null;
  const owner = m[1].toLowerCase();
  return `${PR_OWNER_ALIASES[owner] ?? owner}/${m[2].toLowerCase()}#${m[3]}`;
}
/**
 * The key a stamp was written with before the owner joined it ("repo#number",
 * W.161). Stamps already on cards carry it, and they were matched by repo and
 * number when they were written, so they still describe the card's PR. They
 * are believed until the next sync of that PR, or the backfill, rewrites them
 * with the owner-aware key; refusing them outright would blank every PR chip
 * on the board the moment this shipped.
 */
function legacyPrKey(url: string): string | null {
  const m = PR_LINK.exec(url.trim());
  return m ? `${m[2].toLowerCase()}#${m[3]}` : null;
}

/**
 * The linked PR's title and state, as HTT's PR sync last stamped them through
 * kernel/events (W.161), in `metadata.pr_synced`. Unknown until a sync has seen
 * the PR, and for good on a deployment without HTT, so the card says "PR #1781"
 * and nothing more. The stamp names the PR it describes, and is believed only
 * while that is still the card's PR: a person who swaps the link must not see
 * the old PR's state on the new one until the next sync.
 */
export type CardPrState = "open" | "merged" | "closed";
export type CardPrSync = { key: string; title: string; state: CardPrState };
export function cardPrSync(card: { metadata: Record<string, unknown> }): CardPrSync | null {
  const v = card.metadata?.["pr_synced"] as Partial<CardPrSync> | null | undefined;
  if (!v || typeof v !== "object" || typeof v.key !== "string" || typeof v.title !== "string") return null;
  if (v.state !== "open" && v.state !== "merged" && v.state !== "closed") return null;
  const url = cardPrUrl(card);
  const current = prKey(url);
  if (!current) return null;
  const describesLink = v.key === current || (!v.key.includes("/") && v.key === legacyPrKey(url));
  return describesLink ? { key: v.key, title: v.title, state: v.state } : null;
}
/**
 * Whether the card's stamp was written with the key its link has now. False
 * for a card with no stamp, a stamp of another PR, and a stamp in the
 * owner-less form of W.161, so the backfill asks again for each of those and
 * for nothing else.
 */
export function cardPrStampCurrent(card: { metadata: Record<string, unknown> }): boolean {
  const stamp = cardPrSync(card);
  return !!stamp && stamp.key === prKey(cardPrUrl(card));
}
export function cardBuildSummary(card: { metadata: Record<string, unknown> }): string {
  const v = card.metadata?.["build_summary"];
  return typeof v === "string" ? v : "";
}

/**
 * A card parked until a date (W.54). `metadata.snoozed_until` holds a
 * YYYY-MM-DD calendar date; anything else reads as not snoozed, because a
 * jsonb column carries no constraint and a malformed value must not be allowed
 * to hide a card forever.
 *
 * Deliberately not a status and not a column: a card waiting on a DATE is not
 * waiting on a PERSON, and the Waiting column already means the second thing.
 */
export function cardSnoozedUntil(card: { metadata: Record<string, unknown> }): string | null {
  const v = card.metadata?.["snoozed_until"];
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/**
 * Is this card asleep as of `today` (a YYYY-MM-DD date)? A card wakes ON its
 * date rather than after it, so `snoozed_until` reads as "not before this
 * day" — which is how a person means "not until the 3rd". Comparing the two
 * date strings is the comparison: both are zero-padded ISO, so it is
 * lexicographic and no clock or timezone enters.
 */
export function isSnoozed(card: { metadata: Record<string, unknown> }, today: string): boolean {
  const until = cardSnoozedUntil(card);
  return until !== null && until > today;
}

/**
 * A card whose assignee has asked for a hand (W.62). `metadata.stuck` is
 * `{ since, note }` — when it was raised, and the one line saying what is in
 * the way. The note may be empty; the raising is the message.
 *
 * It is a request for cooperation and nothing else: never an escalation, never
 * settable by anyone but the assignee, never counted, ranked or sent anywhere,
 * and never visible to a client (clientSafeCard blanks metadata before a card
 * leaves the server, which is where that last one is enforced).
 */
export type CardStuck = { since: string; note: string };

export function cardStuck(card: { metadata: Record<string, unknown> }): CardStuck | null {
  const v = card.metadata?.["stuck"];
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const raw = v as { since?: unknown; note?: unknown };
  const since = typeof raw.since === "string" ? raw.since : null;
  if (!since) return null;
  return { since, note: typeof raw.note === "string" ? raw.note : "" };
}

// Every board seeds with these five columns; they can be renamed/reordered later.
export const DEFAULT_COLUMNS: Array<{ name: string; is_done: boolean; is_not_doing: boolean }> = [
  { name: "To do", is_done: false, is_not_doing: false },
  { name: "Doing", is_done: false, is_not_doing: false },
  { name: "Waiting", is_done: false, is_not_doing: false },
  { name: "Done", is_done: true, is_not_doing: false },
  { name: "Not Doing", is_done: false, is_not_doing: true },
];

/** The status a card takes in a column: the one rule every write follows. */
export function columnStatus(column: { is_done: boolean; is_not_doing?: boolean | null }): TaskStatus {
  if (column.is_done) return "done";
  return column.is_not_doing ? "not_doing" : "open";
}

export type BoardRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  client_company_id: string | null;
  // NULL = company-wide (or internal) board; set = keyed to one AI Program.
  ai_program_id: string | null;
  owner_id: string | null;
  status: BoardStatus;
  sort_order: number;
  // Board settings with no column of their own; the keys in use are read
  // through lib/sprint-cadence.ts.
  metadata: Record<string, unknown> | null;
};

export const BOARD_SELECT =
  "id, name, slug, description, client_company_id, ai_program_id, owner_id, status, sort_order, metadata";

export type BoardColumnRow = {
  id: string;
  board_id: string;
  name: string;
  position: number;
  is_done: boolean;
  /**
   * An optional work-in-progress limit (W.31). Information only: the column
   * header reads "7 / 5" and turns amber over the cap, and the drop still
   * succeeds. Null on every column until someone sets one.
   */
  wip_limit: number | null;
  /** The Not Doing column: a card here is closed without being done. Never true with is_done. */
  is_not_doing: boolean;
};

export const BOARD_COLUMN_SELECT = "id, board_id, name, position, is_done, wip_limit, is_not_doing";

export type SprintRow = {
  id: string;
  board_id: string;
  name: string;
  goal: string | null;
  starts_on: string | null;
  ends_on: string | null;
  status: SprintStatus;
  sort_order: number;
  meeting_id: string | null;
  focus_improvement: string | null;
  going_well: string | null;
  meeting_summary: string | null;
  // The company sprint week ("2026-W38"); null on a sprint made before SW-01.
  week: string | null;
  // Set by Finish planning: the committed scope. Null once unlocked.
  locked_at: string | null;
};

export const SPRINT_SELECT =
  "id, board_id, name, goal, starts_on, ends_on, status, sort_order, meeting_id, focus_improvement, going_well, meeting_summary, week, locked_at";

export type EpicRow = {
  id: string;
  board_id: string;
  name: string;
  description: string | null;
  color: string | null;
  status: EpicStatus;
  sort_order: number;
};

export const EPIC_SELECT = "id, board_id, name, description, color, status, sort_order";

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  board_id: string | null;
  board_column_id: string | null;
  sprint_id: string | null;
  epic_id: string | null;
  position: number;
  assignee_id: string | null;
  created_by: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  human_tokens: number | null;
  completed_at: string | null;
  internal: boolean;
  subject_type: string | null;
  subject_id: string | null;
  parent_task_id: string | null;
  metadata: Record<string, unknown>;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export const TASK_SELECT =
  "id, title, description, board_id, board_column_id, sprint_id, epic_id, position, assignee_id, created_by, status, priority, due_date, human_tokens, completed_at, internal, subject_type, subject_id, parent_task_id, metadata, archived_at, created_at, updated_at";

// Whole days a card has sat in its current column, given the last move time.
export function daysInColumn(since: string | null | undefined, now: Date = new Date()): number {
  if (!since) return 0;
  const then = new Date(since).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

/**
 * The card-move server action every board surface hands Workboard as `onMove`.
 * The implementation is `moveCardColumn` in lib/move-card.ts; it is typed here
 * separately because Workboard is a client component and takes the action as a
 * prop rather than importing this entity's server door.
 */
/** What a contractor hands in when their work request's card reaches Done. */
export type HoursReport = { actualHours: number; overtimeHours: number; summary: string; link: string };

/**
 * Records the hours for a contractor card before it lands in Done. The page
 * hands it in, because the request it writes belongs to the portal, which
 * boards may not import; a page without it moves the card with no prompt.
 */
export type ReportHours = (taskId: string, report: HoursReport) => Promise<{ ok: true } | { ok: false; error: string }>;

export type MoveCard = (
  taskId: string,
  toColumnId: string,
  boardSlug: string,
) => Promise<{ ok: true } | { ok: false; error: string }>;
