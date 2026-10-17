// How often the goal's number moved this quarter (K.42). Khoa's decision of
// 2026-09-17 was to reuse the kernel audit trail rather than add a history
// table: every bump writes one `audit_log` row against the goal, so the count
// is a filter over those rows and nothing new lives in the schema.
//
// This is a fact about the goal, not about the member: it says the number has
// been kept current, it is never compared with anyone else's, and it is not
// shown at zero, because "you have not moved it yet" would be a scold.

export type GoalBumpRow = { changed_at: string | null };

// The first day of the calendar quarter `todayISO` falls in, as YYYY-MM-DD.
// Quarters are calendar quarters because that is what the goals' own
// `quarter_label` means everywhere else on the page.
export function quarterStartISO(todayISO: string): string {
  const [y, m] = todayISO.split("-").map(Number);
  if (!y || !m) return todayISO;
  const firstMonth = Math.floor((m - 1) / 3) * 3 + 1;
  return `${y}-${String(firstMonth).padStart(2, "0")}-01`;
}

// The rows that fall on or after the quarter's first day. A row with no
// timestamp cannot be placed in a quarter, so it is not counted: an undated
// row would otherwise inflate every quarter it is read in.
export function bumpsThisQuarter(rows: GoalBumpRow[], todayISO: string): number {
  const start = quarterStartISO(todayISO);
  return rows.filter((row) => typeof row.changed_at === "string" && row.changed_at.slice(0, 10) >= start).length;
}

// The caption under the number, or null when there is nothing worth saying.
export function bumpsCaption(count: number): string | null {
  if (count <= 0) return null;
  if (count === 1) return "Adjusted once this quarter";
  return `Adjusted ${count} times this quarter`;
}

// "bumped Monday" — when the number last moved (K.62). Within the last week a
// weekday name is the thing a member recognises; older than that a weekday is
// ambiguous ("Monday" could be any Monday), so it becomes a date. Null when
// the trail holds nothing, because a goal that has never been bumped is a new
// goal and not a neglected one.
//
// Pure, and given both dates rather than reading the clock, so the caption a
// test asserts is the caption the page renders.
export function lastBumpCaption(lastISO: string | null, todayISO: string): string | null {
  if (!lastISO) return null;
  const day = lastISO.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  // Both dates are read at midnight UTC so the difference is whole days and
  // never a timezone's worth of hours.
  const then = new Date(`${day}T00:00:00Z`);
  const now = new Date(`${todayISO}T00:00:00Z`);
  const days = Math.round((now.getTime() - then.getTime()) / 86_400_000);
  if (!Number.isFinite(days)) return null;
  if (days <= 0) return "bumped today";
  if (days === 1) return "bumped yesterday";
  if (days < 7) {
    return `bumped ${then.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })}`;
  }
  return `bumped ${then.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`;
}

// The goal's move since a date (K.44's goal clause, switched on now that K.42
// writes old and new values on every bump): the value it held before the first
// bump after `sinceISO` and the value the last bump left it at. Null when no
// bump fell in the window, and then the since-line simply says nothing about
// the goal rather than guessing. Rows are not trusted to arrive ordered.
export type GoalMoveRow = {
  changed_at: string | null;
  old_data: { current_value?: number | null } | null;
  new_data: { current_value?: number | null } | null;
};

export function goalMoveSince(rows: GoalMoveRow[], sinceISO: string): { before: number; after: number } | null {
  const inWindow = rows
    .filter((r): r is GoalMoveRow & { changed_at: string } => typeof r.changed_at === "string" && r.changed_at.slice(0, 10) > sinceISO)
    .sort((a, b) => a.changed_at.localeCompare(b.changed_at));
  if (inWindow.length === 0) return null;
  const before = inWindow[0].old_data?.current_value ?? null;
  const after = inWindow[inWindow.length - 1].new_data?.current_value ?? null;
  if (after === null) return null;
  return { before: before ?? 0, after };
}
