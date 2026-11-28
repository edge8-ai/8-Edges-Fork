// What plan §10 keeps (migration 20261008090000): "Once submitted, receipts
// and red invoices cannot be deleted by anyone through the product". How the
// owner takes a receipt or a document off a claim, and which item rows a
// figure counts once one is removed. Pure; split from claim-rules.ts.

/**
 * How the owner takes a receipt or a document off their claim: "delete" from
 * a draft that was never submitted, "mark" (removed, or replaced) from a claim
 * that was, and null while they may not change it. Plan §10: "Once submitted,
 * receipts and red invoices cannot be deleted by anyone through the product".
 * The database refuses the delete on the same fact (20261008090000), so the
 * product offers delete exactly where it would succeed.
 */
export type OwnerRemoval = "delete" | "mark" | null;

/**
 * The item rows a figure counts (plan §10, 20261008090000): one the owner
 * removed from a claim that was ever submitted stays on it, shown as removed,
 * and counts toward nothing — no total, no queue, no approval, no run, no
 * submit or check rule. Read from the row's own `removed_at`, so a read that
 * stops selecting it counts the row again; the suites answer only selected
 * columns to catch that. Pure.
 */
export function stillCounted<T extends { removed_at?: unknown }>(rows: T[]): T[] {
  return rows.filter((r) => r.removed_at === null || r.removed_at === undefined);
}
