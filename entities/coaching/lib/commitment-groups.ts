// The Commitments tab, the Home block and the My Week list (L.18.3), as pure
// functions of rows already loaded. Plain values in, plain values out, so the
// grouping, the ordering and the sprint-window rule are tested without a
// database, and the client components may import this file without dragging
// the data layer into their bundle.

import { OPEN_COMMITMENT_STATUSES, type CommitmentOwner, type CommitmentStatus } from "./types";

// The atoms the rows' buttons need (ADR 0014): the member's writers sit behind
// coaching.mine, the coach's behind surface.team. Here rather than beside the
// client list, because a server parent builds the `may` prop from it.
export const COMMITMENT_ROW_ATOMS = ["coaching.mine", "surface.team"] as const;

// Whose promise a row is, seen from the reader:
//   mine    — I promised my coach (owner member, on my own profile)
//   theirs  — my coach promised me (owner coach, on my own profile); read-only
//   coach   — I promised someone I coach (owner coach, on their profile)
//   coachee — someone I coach promised me, seen on their coach page (L.18.4).
//             The coach may close it or put it on a board: the coach answers
//             for the pair, so they act on either side (Dave, 2026-10-15). The
//             member acts only on their own; their coach's stay read-only.
export type CommitmentSide = "mine" | "theirs" | "coach" | "coachee";

export type CommitmentRow = {
  id: string;
  profileId: string;
  side: CommitmentSide;
  owner: CommitmentOwner;
  title: string;
  status: CommitmentStatus;
  // Why it was dropped, among other notes; shown on a closed row.
  statusNote: string | null;
  dueOn: string | null;
  createdAt: string;
  statusUpdatedAt: string | null;
  planMd: string | null;
  askNowSentAt: string | null;
  // The day of the 1-1 it came from, when it came from one.
  heldOn: string | null;
  // The coachee's name, when the row is shown under someone else's name: on a
  // coach row on My Coaching, and on a coachee row on their coach page; else null.
  personName: string | null;
  // Its live Workboard card, once pushed.
  card: { boardSlug: string; boardName: string; columnName: string; done: boolean } | null;
};

export function isOpen(status: CommitmentStatus): boolean {
  return OPEN_COMMITMENT_STATUSES.includes(status);
}

/** Rows the reader answers for: their own promises, as a coachee or a coach. */
export function isOwned(row: CommitmentRow): boolean {
  return row.side === "mine" || row.side === "coach";
}

// Open rows: the earliest due first, undated after, newest first among equals.
function byDueThenNewest(a: CommitmentRow, b: CommitmentRow): number {
  const d = (a.dueOn ?? "9999-12-31").localeCompare(b.dueOn ?? "9999-12-31");
  return d !== 0 ? d : b.createdAt.localeCompare(a.createdAt);
}

// Closed rows: the most recently closed first.
function byClosedNewest(a: CommitmentRow, b: CommitmentRow): number {
  return (b.statusUpdatedAt ?? b.createdAt).localeCompare(a.statusUpdatedAt ?? a.createdAt);
}

/** The coachee's half of the tab: what I promised, what my coach promised me, and everything closed. */
export function groupMine(rows: CommitmentRow[]): { mine: CommitmentRow[]; theirs: CommitmentRow[]; closed: CommitmentRow[] } {
  const open = rows.filter((r) => isOpen(r.status));
  return {
    mine: open.filter((r) => r.side === "mine").sort(byDueThenNewest),
    theirs: open.filter((r) => r.side === "theirs").sort(byDueThenNewest),
    closed: rows.filter((r) => !isOpen(r.status)).sort(byClosedNewest),
  };
}

export type PersonGroup = { profileId: string; personName: string; open: CommitmentRow[]; closed: CommitmentRow[] };

/** One coached person's page: what they promised me, what I promised them, and everything closed. */
export function groupForCoach(rows: CommitmentRow[]): { theirs: CommitmentRow[]; mine: CommitmentRow[]; closed: CommitmentRow[] } {
  const open = rows.filter((r) => isOpen(r.status));
  return {
    theirs: open.filter((r) => r.side === "coachee").sort(byDueThenNewest),
    mine: open.filter((r) => r.side === "coach").sort(byDueThenNewest),
    closed: rows.filter((r) => !isOpen(r.status)).sort(byClosedNewest),
  };
}

/** The coach's half: their promises grouped by the person they were made to, by name. */
export function groupByPerson(rows: CommitmentRow[]): PersonGroup[] {
  const groups = new Map<string, PersonGroup>();
  for (const r of rows) {
    const g = groups.get(r.profileId) ?? { profileId: r.profileId, personName: r.personName ?? "", open: [], closed: [] };
    (isOpen(r.status) ? g.open : g.closed).push(r);
    groups.set(r.profileId, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, open: g.open.sort(byDueThenNewest), closed: g.closed.sort(byClosedNewest) }))
    .sort((a, b) => a.personName.localeCompare(b.personName));
}

/** Home: the newest open promises the reader owns, either side. */
export function newestOpenOwned(rows: CommitmentRow[], limit = 3): CommitmentRow[] {
  return rows
    .filter((r) => isOwned(r) && isOpen(r.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/**
 * My Week: the open promises the reader owns, those due inside the sprint
 * window first (earliest due first), then the rest newest first. A promise with
 * a Workboard card is left out: My Week already lists the card, and the same
 * work twice reads as two things to do.
 */
export function myWeekRows(rows: CommitmentRow[], window: { startsOn: string; endsOn: string }): CommitmentRow[] {
  const open = rows.filter((r) => isOwned(r) && isOpen(r.status) && !r.card);
  const inWindow = (r: CommitmentRow) => r.dueOn !== null && r.dueOn >= window.startsOn && r.dueOn <= window.endsOn;
  return [
    ...open.filter(inWindow).sort(byDueThenNewest),
    ...open.filter((r) => !inWindow(r)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  ];
}
