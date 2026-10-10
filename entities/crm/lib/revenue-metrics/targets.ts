import { companyOs } from "@/kernel/data/supabase";
import { collectErrors, type Loaded } from "./shared";

// Company-level targets (2026-09-13): one figure per metric and period that
// the hub's tiles compare against. There is no owner column and none may be
// added; the CEO rule is that no metric describes a person.

export const TARGET_METRICS = ["won_usd", "invoiced_usd", "inquiries", "meetings"] as const;
export type TargetMetric = (typeof TARGET_METRICS)[number];
export const TARGET_LABELS: Record<TargetMetric, string> = { won_usd: "Won (USD)", invoiced_usd: "Invoiced (USD)", inquiries: "Inquiries", meetings: "Meetings held" };
export const MONEY_METRICS: ReadonlySet<TargetMetric> = new Set<TargetMetric>(["won_usd", "invoiced_usd"]);

export const PERIOD_KINDS = ["month", "quarter", "year"] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

export type TargetRow = { id: string; metric: string; period_kind: string; period_start: string; amount: number; note: string | null; updated_at: string };

export type Targets = Loaded & { rows: TargetRow[] };

// The first day of the period of `kind` that contains `now`, as YYYY-MM-DD.
export function periodStart(kind: PeriodKind, now: Date): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  if (kind === "year") return `${y}-01-01`;
  if (kind === "quarter") return `${y}-${String(Math.floor(m / 3) * 3 + 1).padStart(2, "0")}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

// The target amount for a metric in the current period of a kind, or null.
export function targetFor(rows: TargetRow[], metric: TargetMetric, kind: PeriodKind, now: Date): TargetRow | null {
  const start = periodStart(kind, now);
  return rows.find((r) => r.metric === metric && r.period_kind === kind && r.period_start === start) ?? null;
}

// What to call the current period of a kind on screen: "September 2026",
// "Q4 2026", "2026". One function, so a tile's "vs target" line and the
// Targets card's heading can never name different periods for one figure.
export function periodLabelOf(kind: PeriodKind, now: Date): string {
  const y = now.getUTCFullYear();
  if (kind === "year") return String(y);
  if (kind === "quarter") return `Q${Math.floor(now.getUTCMonth() / 3) + 1} ${y}`;
  return now.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

// How far along the current period is, 0..1, so a tile can say whether the
// figure is ahead of or behind the pace the target implies.
export function periodProgress(kind: PeriodKind, now: Date): number {
  const start = new Date(`${periodStart(kind, now)}T00:00:00Z`);
  const months = kind === "year" ? 12 : kind === "quarter" ? 3 : 1;
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1));
  return Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / (end.getTime() - start.getTime())));
}

export async function loadTargets(): Promise<Targets> {
  const res = await companyOs.from("revenue_targets").select("id, metric, period_kind, period_start, amount, note, updated_at").order("period_start", { ascending: false }).limit(500);
  return { errors: collectErrors({ error: res.error, label: "targets" }), rows: (res.data ?? []) as TargetRow[] };
}

export type TargetInput = { metric: TargetMetric; periodKind: PeriodKind; periodStart: string; amount: number; note: string | null; createdBy: string };

// Upsert on (metric, period_kind, period_start); a zero amount removes the row,
// so "no target" is the absence of a row rather than a target of nothing.
export async function writeRevenueTarget(input: TargetInput): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.amount <= 0) {
    const { error } = await companyOs.from("revenue_targets").delete().eq("metric", input.metric).eq("period_kind", input.periodKind).eq("period_start", input.periodStart);
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  const { error } = await companyOs
    .from("revenue_targets")
    .upsert(
      { metric: input.metric, period_kind: input.periodKind, period_start: input.periodStart, amount: Math.round(input.amount), note: input.note, created_by: input.createdBy, updated_at: new Date().toISOString() },
      { onConflict: "metric,period_kind,period_start" },
    );
  return error ? { ok: false, error: error.message } : { ok: true };
}
