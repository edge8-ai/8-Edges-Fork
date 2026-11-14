// What every Revenue hub aggregate shares (RH-3): month keys, age buckets,
// the source vocabulary, and the one rule that shapes all of them. No
// aggregate in this folder accepts an owner, assignee, author or mover column.
// Every figure describes deals, inquiries, invoices, campaigns or companies.

export type MonthPoint<T = { count: number }> = { month: string; label: string } & T;

// "2026-09" for a timestamp or date string; null when absent.
export const monthKey = (iso: string | null | undefined): string | null => (iso ? String(iso).slice(0, 7) : null);

// The last `n` month keys ending this month, oldest first.
export function lastMonths(n: number, now: Date): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

// The next `n` month keys starting this month, for a forecast axis.
export function nextMonths(n: number, now: Date): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

// "Sep" or "Jan 27" at a year boundary, for a compact axis.
export function monthLabel(key: string): string {
  const d = new Date(`${key}-01T00:00:00Z`);
  const mon = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return key.endsWith("-01") ? `${mon} ${key.slice(2, 4)}` : mon;
}

export const AGE_BUCKETS = ["0–7 d", "8–30 d", "31–90 d", "90+ d"] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number];

export const daysBetween = (from: string, now: Date): number => Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / 86_400_000));

export function ageBucket(days: number): AgeBucket {
  if (days <= 7) return "0–7 d";
  if (days <= 30) return "8–30 d";
  if (days <= 90) return "31–90 d";
  return "90+ d";
}

export type BucketCount = { label: string; value: number };

export const emptyBuckets = (): Record<AgeBucket, number> => ({ "0–7 d": 0, "8–30 d": 0, "31–90 d": 0, "90+ d": 0 });

export const bucketsToRows = (b: Record<AgeBucket, number>): BucketCount[] => AGE_BUCKETS.map((label) => ({ label, value: b[label] }));

// The channel a free-text deal source belongs to. `thoughtflow_crm` is the
// name of the old system, not a channel; an order or a retreat is a product
// bought, not a way we were found. Unknown strings pass through humanised so
// a new source shows up rather than vanishing into "other".
const SOURCE_CHANNELS: Record<string, string> = {
  thoughtflow_crm: "legacy import",
  legacy_import: "legacy import",
  sdr_handoff: "outbound (SDR)",
  referral: "referral",
  affiliate: "affiliate",
  retreat: "retreat",
  "order:stripe": "stripe order",
  portal_build_team: "portal request",
  portal: "portal request",
  inbound: "inbound site",
  website: "inbound site",
  "edge8.ai": "inbound site",
};

export function sourceChannel(source: string | null | undefined): string {
  if (!source) return "no source";
  const key = source.trim().toLowerCase();
  return SOURCE_CHANNELS[key] ?? key.replace(/[_:]+/g, " ");
}

export const cents = (n: number | null | undefined): number => (typeof n === "number" && Number.isFinite(n) ? n : 0);

// A row's value in USD cents: the normalised figure when it exists, else the
// native amount only when the row is already in USD. Anything else is zero
// rather than a wrong currency added into a dollar total.
export const usdOf = (r: { amount_usd_cents?: number | null; amount_cents?: number | null; currency?: string | null }): number =>
  cents(r.amount_usd_cents) || ((r.currency ?? "usd").toLowerCase() === "usd" ? cents(r.amount_cents) : 0);

export function countBy<T>(rows: T[], key: (r: T) => string, top?: number): BucketCount[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  const out = [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  return top ? out.slice(0, top) : out;
}

// ── Range and comparison ─────────────────────────────────────────────────
// Every hub tab reads one `range` search param and hands the same window to
// its loader, so the tiles, the charts and their "vs prior" deltas agree.
// "ytd" is the calendar year so far; the others are trailing months. The
// prior window is the same length again, ending where this one starts.

export const RANGES = ["3m", "6m", "12m", "ytd", "24m"] as const;
export type Range = (typeof RANGES)[number];
export const RANGE_LABELS: Record<Range, string> = { "3m": "3 months", "6m": "6 months", "12m": "12 months", ytd: "Year to date", "24m": "24 months" };
export const DEFAULT_RANGE: Range = "12m";

export function parseRange(v: string | string[] | undefined): Range {
  const s = Array.isArray(v) ? v[0] : v;
  return (RANGES as readonly string[]).includes(s ?? "") ? (s as Range) : DEFAULT_RANGE;
}

// How many months the range covers, ending this month.
export function rangeMonths(range: Range, now: Date): number {
  if (range === "ytd") return now.getUTCMonth() + 1;
  return Number(range.replace("m", ""));
}

// The month keys of the range and of the prior window of equal length.
export function rangeWindows(range: Range, now: Date): { months: string[]; prior: string[] } {
  const n = rangeMonths(range, now);
  const all = lastMonths(2 * n, now);
  return { months: all.slice(n), prior: all.slice(0, n) };
}

// The change from the prior window, as a percentage, or null when the prior
// window was empty and a percentage would be meaningless.
export function pctDelta(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

export type Compared = { value: number; prior: number; delta: number | null };
export const compared = (value: number, prior: number): Compared => ({ value, prior, delta: pctDelta(value, prior) });

// Every loader collects the message of each failed read instead of logging it
// to a console nobody watches. The page shows them; the figures underneath
// are then read as "what could be loaded", never as zeros.
export type Loaded = { errors: string[] };
export function collectErrors(...results: { error: { message: string } | null; label: string }[]): string[] {
  return results.flatMap((r) => (r.error ? [`${r.label}: ${r.error.message}`] : []));
}

// An invoice's value in USD cents. Finance owns the invoices table and the
// rule: the stored USD figure at QuickBooks' own rate, a USD invoice's own
// amount, and nothing for a foreign invoice not yet converted.
export { invoiceIsUsd, invoiceUsd, invoiceBalanceUsd, invoiceUnconverted } from "@/entities/finance";

// ── What counts as an open deal ──────────────────────────────────────────
// Two tabs forecast money from open deals: Pipeline's expected-close chart and
// Billing's 90-day cash figure. They must not disagree about which deals those
// are, so the test lives here once. A deal is closed when its own status says
// so OR when the stage it sits in is flagged won or lost — a deal moved to
// Closed Won without its status being set is still closed, and counting it as
// pipeline is how a forecast quietly inflates.

export type StageFlags = { id: string; is_won: boolean; is_lost: boolean };
export type ClosableDeal = { status: string | null; stage_id: string | null; archived_at: string | null };

export type DealState = {
  isWon: (d: ClosableDeal) => boolean;
  isClosed: (d: ClosableDeal) => boolean;
  isOpen: (d: ClosableDeal) => boolean;
};

export function dealState(stages: StageFlags[]): DealState {
  const byId = new Map(stages.map((s) => [s.id, s]));
  const stageOf = (d: ClosableDeal) => (d.stage_id ? byId.get(d.stage_id) : undefined);
  const isWon = (d: ClosableDeal) => d.status === "won" || !!stageOf(d)?.is_won;
  const isClosed = (d: ClosableDeal) => d.status === "won" || d.status === "lost" || !!stageOf(d)?.is_won || !!stageOf(d)?.is_lost;
  return { isWon, isClosed, isOpen: (d) => !d.archived_at && !isClosed(d) };
}

export const AR_BUCKETS = ["current", "1–30 d", "31–60 d", "61–90 d", "90+ d"] as const;
export type ArBucket = (typeof AR_BUCKETS)[number];
export function arBucket(daysPastDue: number): ArBucket {
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "1–30 d";
  if (daysPastDue <= 60) return "31–60 d";
  if (daysPastDue <= 90) return "61–90 d";
  return "90+ d";
}

// ── Select lists proved against their row type (A.5) ─────────────────────

/**
 * One column, named the way PostgREST will return it. A plain key selects the
 * column; `key(...)`, `key!fk(...)` and `alias:table(...)` all select an
 * embedded row under that key, which is how `companies!company_id(name)`
 * arrives as `companies` and `people(full_name)` arrives as `people`.
 */
export type ColumnFor<K extends string> =
  | K
  | `${K}(${string}`
  | `${K}!${string}`
  | `${K}:${string}`;

/**
 * The select string for a row type, proved against it.
 *
 * Every key of `Row` must appear, no key that is not on `Row` may appear, and
 * each entry must select into the key it sits under. Drop a column and the
 * build fails; add a field to the row type and the build fails. That is the
 * whole point: a select list and the type it produces are one fact, and they
 * were two.
 */
export function columnList<Row>(columns: { [K in keyof Row & string]-?: ColumnFor<K> }): string {
  return Object.values(columns).join(", ");
}
