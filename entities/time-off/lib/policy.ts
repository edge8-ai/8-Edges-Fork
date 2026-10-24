// The leave policy row as the app reads it: the structured accrual rules
// (validated, since `tiers` is JSON) plus the labels every surface uses to
// describe them. Browser-safe: no data client, so the admin editor and the
// server pages share one vocabulary.
import { z } from "zod";
import type { AccrualCadence, AccrualPolicy, AccrualTier, YearBasis } from "./balance";

export const YEAR_BASES = ["calendar", "anniversary"] as const satisfies readonly YearBasis[];
export const ACCRUAL_CADENCES = ["none", "monthly", "semi_monthly"] as const satisfies readonly AccrualCadence[];

export const YEAR_BASIS_LABEL: Record<YearBasis, string> = {
  calendar: "Calendar year, resets 1 January",
  anniversary: "Anniversary year, resets on the day accrual started",
};

// The day accrual and the leave year count from. The Edge8 policy counts from
// the first contract (the day probation ended); a client policy may count from
// the start date.
export const COUNTS_FROM = ["probation_end", "start_date"] as const;
export type CountsFrom = (typeof COUNTS_FROM)[number];
export const COUNTS_FROM_LABEL: Record<CountsFrom, string> = {
  probation_end: "the day probation ended (the first contract)",
  start_date: "the start date",
};

export const CADENCE_LABEL: Record<AccrualCadence, string> = {
  none: "No paid leave",
  monthly: "Monthly, on the last day of the month",
  semi_monthly: "Twice a month, on the 15th and the last day",
};

export const tierSchema = z.object({
  fromYear: z.number().int().min(1),
  hoursPerYear: z.number().min(0),
});
export const tiersSchema = z.array(tierSchema);

export type LeavePolicySummary = {
  id: string;
  name: string;
  autoApprove: boolean;
  policyText: string | null;
  accrual: AccrualPolicy;
  honourImportedBalance: boolean;
  countsFrom: CountsFrom;
};

// The columns the summary needs, as one select string so every reader asks
// for the same shape.
export const POLICY_COLUMNS =
  "id, name, auto_approve, policy_text, year_basis, accrual_cadence, tiers, hours_per_day, min_increment_hours, carry_cap_hours, bank_leave_types, honour_imported_balance, counts_from";

export type PolicyDbRow = {
  id: string;
  name: string;
  auto_approve: boolean;
  policy_text: string | null;
  year_basis: string;
  accrual_cadence: string;
  tiers: unknown;
  hours_per_day: number | string;
  min_increment_hours: number | string;
  carry_cap_hours: number | string | null;
  bank_leave_types: string[] | null;
  honour_imported_balance: boolean;
  counts_from: string;
};

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
};

// Tiers come back sorted so the "last tier at or below the service year" rule
// in balance.ts holds however an admin typed them in.
export function parseTiers(value: unknown): AccrualTier[] {
  const parsed = tiersSchema.safeParse(value);
  if (!parsed.success) return [];
  return [...parsed.data].sort((a, b) => a.fromYear - b.fromYear);
}

export function toPolicySummary(row: PolicyDbRow): LeavePolicySummary {
  const yearBasis = (YEAR_BASES as readonly string[]).includes(row.year_basis) ? (row.year_basis as YearBasis) : "calendar";
  const cadence = (ACCRUAL_CADENCES as readonly string[]).includes(row.accrual_cadence)
    ? (row.accrual_cadence as AccrualCadence)
    : "none";
  return {
    id: row.id,
    name: row.name,
    autoApprove: row.auto_approve,
    policyText: row.policy_text,
    honourImportedBalance: row.honour_imported_balance,
    countsFrom: (COUNTS_FROM as readonly string[]).includes(row.counts_from) ? (row.counts_from as CountsFrom) : "probation_end",
    accrual: {
      yearBasis,
      cadence,
      tiers: parseTiers(row.tiers),
      hoursPerDay: num(row.hours_per_day) ?? 8,
      minIncrementHours: num(row.min_increment_hours) ?? 4,
      carryCapHours: num(row.carry_cap_hours),
      bankLeaveTypes: row.bank_leave_types ?? ["vacation"],
    },
  };
}

// "Years 1 to 2: 10 days (3.33 h per period)" for each tier, in order.
export function describeTiers(accrual: AccrualPolicy): { years: string; days: string; perPeriod: string }[] {
  const periods = accrual.cadence === "semi_monthly" ? 24 : accrual.cadence === "monthly" ? 12 : 0;
  return accrual.tiers.map((t, i) => {
    const next = accrual.tiers[i + 1];
    const years = next
      ? next.fromYear - t.fromYear === 1
        ? `Year ${t.fromYear}`
        : `Years ${t.fromYear} to ${next.fromYear - 1}`
      : `Year ${t.fromYear} onward`;
    const days = formatNumber(t.hoursPerYear / accrual.hoursPerDay);
    const perPeriod = periods > 0 ? `${formatNumber(t.hoursPerYear / periods)} h per period` : "";
    return { years, days: `${days} days (${formatNumber(t.hoursPerYear)} h)`, perPeriod };
  });
}

// Up to two decimals, trailing zeros dropped: 3.3333 → "3.33", 8 → "8".
export function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

// Split the stored policy text into paragraphs for rendering; blank lines
// separate them and single line breaks stay inside a paragraph.
export function policyParagraphs(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
