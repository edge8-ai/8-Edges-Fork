// What the company key result did since the member last sat down with their
// coach (K.43). The rung above the goal is the reason the goal exists, so when
// the company number moves the member should see the move, not just the number.
//
// There is no "last seen" table and Khoa's decision of 2026-09-17 was that
// there will not be one: the comparison point is the member's last held 1-1,
// and the value the key result had then is recovered from the kernel audit
// trail. Two readings, in this order:
//
//   1. the newest audit row written on or before the meeting — its `new_data`
//      holds the value the key result was left at, which is the value that
//      stood during the meeting;
//   2. failing that, the oldest audit row written after the meeting — its
//      `old_data` holds the value that row replaced, which is the same value
//      seen from the other side.
//
// When neither exists there is no honest baseline, so nothing is claimed: the
// rung shows the number on its own and no movement line at all.
//
// This is a fact about a company key result — a number about the company's
// work — and never about whoever moved it. The rows' actor is deliberately not
// read here.

export type KeyResultAuditRow = {
  changed_at: string | null;
  old_data: unknown;
  new_data: unknown;
};

// The value the key result stood at, and how far it has come since.
export type KeyResultMove = { previous: number; delta: number };

// `audit_log`'s jsonb columns arrive as unknown; only a finite number on
// `current_value` counts, because a patch that never touched the value says
// nothing about where the value was.
function currentValueOf(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const value = (data as Record<string, unknown>).current_value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// `changed_at` is a timestamp and `sinceISO` a Saigon date, so the comparison
// is on the date part only: a row written on the day of the meeting counts as
// having been seen at it.
function dayOf(row: KeyResultAuditRow): string | null {
  return typeof row.changed_at === "string" && row.changed_at.length >= 10 ? row.changed_at.slice(0, 10) : null;
}

export function keyResultDelta(
  rows: KeyResultAuditRow[],
  currentValue: number | null,
  sinceISO: string | null,
): KeyResultMove | null {
  if (currentValue === null || !sinceISO) return null;

  const dated = rows
    .map((row) => ({ row, day: dayOf(row) }))
    .filter((entry): entry is { row: KeyResultAuditRow; day: string } => entry.day !== null)
    .sort((a, b) => (a.row.changed_at! < b.row.changed_at! ? -1 : 1));

  let previous: number | null = null;
  for (const entry of dated) {
    if (entry.day > sinceISO) break;
    const value = currentValueOf(entry.row.new_data);
    if (value !== null) previous = value;
  }
  if (previous === null) {
    const after = dated.find((entry) => entry.day > sinceISO && currentValueOf(entry.row.old_data) !== null);
    previous = after ? currentValueOf(after.row.old_data) : null;
  }
  if (previous === null) return null;
  return { previous, delta: currentValue - previous };
}

// "+100" / "−20". A signed number reads as movement where a bare one reads as a
// quantity, and the minus is the typographic one so a fall does not look like a
// hyphenated word.
export function signedDelta(delta: number): string {
  return delta < 0 ? `−${Math.abs(delta)}` : `+${delta}`;
}
