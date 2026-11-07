import { progressPct, type KrRow } from "./edges-shared";

// How Company Goals reads a key result and an objective (G.14), shared by the
// team view and the admin editor so the two never disagree. Pure, and safe in
// the browser.
//
// A key result nobody has measured is not a zero: it has no percent, it says
// so, and it stays out of its objective's percent until it has a number. The
// unmeasured set comes from getNeverMeasuredKeyResults.

export type KrTone = "on" | "risk" | "off" | "hit" | "unmeasured";
export type ObjectiveTone = "on" | "risk" | "off";

export const KR_TONE_LABEL: Record<KrTone, string> = {
  on: "On track",
  risk: "At risk",
  off: "Off track",
  hit: "Hit",
  unmeasured: "Not measured yet",
};

export type KrProgress = {
  measured: boolean;
  // Null when unmeasured or when the key result has no target.
  pct: number | null;
  tone: KrTone;
  value: string;
  target: string | null;
  // The counted noun ("keynotes") when the unit is one; "" for money, %, days.
  unit: string;
  // Whether the year's pace marker means anything on this bar: a "lower is
  // better" target is not reached by the passage of time.
  paced: boolean;
};

function money(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${trim(v / 1_000_000)}M`;
  if (Math.abs(v) >= 1000) return `$${trim(v / 1000)}k`;
  return `$${trim(v)}`;
}

function trim(v: number): string {
  return Number.isInteger(v) ? v.toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function shape(n: number, unit: string | null): { text: string; noun: string } {
  if (unit === "usd") return { text: money(n), noun: "" };
  if (unit === "%") return { text: `${trim(n)}%`, noun: "" };
  if (unit === "days") return { text: `${trim(n)}d`, noun: "" };
  if (unit === "min") return { text: `${trim(n)}m`, noun: "" };
  if (unit === "score") return { text: trim(n), noun: "" };
  return { text: trim(n), noun: unit ?? "" };
}

export function krProgress(kr: KrRow, measured: boolean): KrProgress {
  const current = shape(Number(kr.current_value), kr.unit);
  const t = kr.target_value == null ? null : Number(kr.target_value);
  const target = t == null ? null : (kr.direction === "down" ? "≤ " : "") + shape(t, kr.unit).text;
  if (!measured) {
    return { measured, pct: null, tone: "unmeasured", value: current.text, target, unit: current.noun, paced: false };
  }
  const pct = t == null ? null : progressPct(kr);
  const tone: KrTone =
    kr.status === "done" || (pct ?? 0) >= 100
      ? "hit"
      : kr.status === "off_track"
        ? "off"
        : kr.status === "at_risk"
          ? "risk"
          : "on";
  return { measured, pct, tone, value: current.text, target, unit: current.noun, paced: kr.direction !== "down" && pct != null };
}

export type ObjectiveRollup = {
  // Mean percent of the measured key results with a target; null until one has.
  pct: number | null;
  tone: ObjectiveTone;
  counts: { tone: KrTone; n: number }[];
};

const COUNT_ORDER: KrTone[] = ["hit", "on", "risk", "off", "unmeasured"];

export function objectiveRollup(krs: KrRow[], unmeasured: ReadonlySet<string>): ObjectiveRollup {
  const tally = new Map<KrTone, number>();
  let sum = 0;
  let n = 0;
  for (const kr of krs) {
    const p = krProgress(kr, !unmeasured.has(kr.id));
    tally.set(p.tone, (tally.get(p.tone) ?? 0) + 1);
    if (p.pct != null) {
      sum += p.pct;
      n += 1;
    }
  }
  const tone: ObjectiveTone = tally.get("off") ? "off" : tally.get("risk") ? "risk" : "on";
  const counts = COUNT_ORDER.flatMap((t) => (tally.get(t) ? [{ tone: t, n: tally.get(t) as number }] : []));
  return { pct: n ? Math.round(sum / n) : null, tone, counts };
}

// The share of a goal year gone, 0-100: where the pace marker sits on each bar.
// Company goals run by calendar year (G.13).
export function yearPacePct(year: number, now: Date = new Date()): number {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const t = now.getTime();
  if (t <= start) return 0;
  if (t >= end) return 100;
  return Math.round(((t - start) / (end - start)) * 100);
}
