// Shared helpers for the admin dashboard and the four office cockpits. These
// were previously inline in app/admin/(dashboard)/page.tsx; extracted here so
// the master dashboard and every cockpit share one copy.

export const MS_DAY = 86_400_000;

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

// `one`/`Embedded` used to live here; they now come from lib/embedded so every
// reader shares a single copy. Re-exported so existing dashboard imports keep working.
export { one } from "@/kernel/config/embedded";

// Compact money for chart direct labels and tight tiles ("$84.2k" beats
// "$84,203" in 12px type). Input is cents.
export function compactUsd(cents: number): string {
  const d = cents / 100;
  // "$1027k" reads worse than "$1.03M"; the hero tiles crossed that line.
  if (d >= 1_000_000) return `$${(d / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (d >= 100_000) return `$${Math.round(d / 1000)}k`;
  if (d >= 1000) return `$${(d / 1000).toFixed(1)}k`;
  return `$${Math.round(d)}`;
}

// Delta sub-line for rolling-30-day tiles.
export function vsPrior(cur: number, prev: number, fmt: (n: number) => string = String): string {
  if (prev <= 0) return `prior 30d: ${fmt(prev)}`;
  const pct = Math.round(((cur - prev) / prev) * 100);
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "＝";
  return `${arrow} ${Math.abs(pct)}% vs prior 30d (${fmt(prev)})`;
}

// Year-to-date month buckets [{ label, from, to }], each an inclusive-from /
// exclusive-to ISO date pair. Both revenue-by-month and applications-by-month
// bucket the same way.
export function monthsThisYear(now: Date): { label: string; from: string; to: string }[] {
  const year = now.getUTCFullYear();
  return MONTHS.slice(0, now.getUTCMonth() + 1).map((label, m) => {
    const from = `${year}-${String(m + 1).padStart(2, "0")}-01`;
    const to = m + 1 < 12 ? `${year}-${String(m + 2).padStart(2, "0")}-01` : `${year + 1}-01-01`;
    return { label, from, to };
  });
}
