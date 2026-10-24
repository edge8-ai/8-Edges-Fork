// Pure date arithmetic and the review scheduling rules, split out of ./reviews
// so they can be tested without touching Supabase. Nothing here does IO.
//
// `addMonths` below is NOT the same thing as kernel/config/dates' `shiftMonth`:
// that one moves a {year, month} pair and has no day at all (it exists so the
// month-grid pickers cannot roll over), while this one moves a YYYY-MM-DD date
// and clamps the day to the end of the target month (Jan 31 + 1mo = Feb 28/29).
// They answer different questions on different inputs, so this local copy stays.

import { addDays } from "@/kernel/config/dates";
import type { ReviewType } from "./reviews-labels";

// The three scheduled moments (docs/plans/2026-08-12-performance-reviews.md):
//   probation  start_date + 6 weeks   (one-time, year one)
//   midyear    contract anchor + 5 months   (annual)
//   renewal    contract anchor + 11 months  (annual, i.e. 1 month before the
//              12-month contract anniversary)
// The anchor is contract_start_date when set, else start_date. This is an
// informational estimate for the admin profile; the rigorous scheduler that
// fires cycles is PR 3.
const PROBATION_LEAD_DAYS = 42;
const MIDYEAR_OFFSET_MONTHS = 5;
const RENEWAL_OFFSET_MONTHS = 11;
// Probation only stays relevant near the start; past this it is moot.
const PROBATION_RELEVANT_DAYS = 90;

export function toUTCDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}
export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
// Month arithmetic that clamps to the month end (e.g. Jan 31 + 1mo = Feb 28/29).
export function addMonths(iso: string, months: number): string {
  const d = toUTCDate(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return toISODate(d);
}
// Roll an annual moment forward whole years until it is today or later.
export function rollToFuture(iso: string, todayISO: string): string {
  let cur = iso;
  let guard = 0;
  while (cur < todayISO && guard < 20) {
    cur = addMonths(cur, 12);
    guard++;
  }
  return cur;
}

export type NextReview = {
  type: Exclude<ReviewType, "annual" | "adhoc">;
  date: string;
} | null;

export function computeNextReview(input: {
  startDate: string | null;
  contractStartDate: string | null;
  hasProbationReview: boolean;
  todayISO: string;
}): NextReview {
  const anchor = input.contractStartDate ?? input.startDate;
  const candidates: { type: Exclude<ReviewType, "annual" | "adhoc">; date: string }[] = [];

  if (
    input.startDate &&
    !input.hasProbationReview &&
    input.todayISO <= addDays(input.startDate, PROBATION_RELEVANT_DAYS)
  ) {
    candidates.push({ type: "probation", date: addDays(input.startDate, PROBATION_LEAD_DAYS) });
  }
  if (anchor) {
    candidates.push({
      type: "midyear",
      date: rollToFuture(addMonths(anchor, MIDYEAR_OFFSET_MONTHS), input.todayISO),
    });
    candidates.push({
      type: "renewal",
      date: rollToFuture(addMonths(anchor, RENEWAL_OFFSET_MONTHS), input.todayISO),
    });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.date.localeCompare(b.date));
  return candidates[0];
}

// ---- scheduler: which cycles are due to open right now ----------------------

export type ScheduledMoment = {
  type: "probation" | "midyear" | "renewal";
  date: string;
  cycleLabel: string;
};

// The moments whose date falls in the open window [today - graceDays, today].
// Deterministic cycle labels (`<type>-auto-<year>`) make opening idempotent:
// once a cycle exists for a label the scheduler skips it. The grace window
// stops the scheduler retro-opening ancient moments when a member's dates are
// filled in late (an overdue review is a manual "Send review now", not an
// automatic surprise months later).
export function reviewMomentsInWindow(input: {
  startDate: string | null;
  contractStartDate: string | null;
  hasProbationReview: boolean;
  todayISO: string;
  graceDays: number;
}): ScheduledMoment[] {
  const anchor = input.contractStartDate ?? input.startDate;
  const windowStart = addDays(input.todayISO, -input.graceDays);
  const out: ScheduledMoment[] = [];

  if (input.startDate && !input.hasProbationReview) {
    const date = addDays(input.startDate, PROBATION_LEAD_DAYS);
    if (date >= windowStart && date <= input.todayISO)
      out.push({ type: "probation", date, cycleLabel: `probation-auto-${input.startDate.slice(0, 4)}` });
  }
  if (anchor) {
    for (const [type, offset] of [
      ["midyear", MIDYEAR_OFFSET_MONTHS],
      ["renewal", RENEWAL_OFFSET_MONTHS],
    ] as const) {
      // The occurrence for this contract year: roll the base forward until it
      // reaches the window, then accept it only if it is today or earlier.
      let date = addMonths(anchor, offset);
      let guard = 0;
      while (date < windowStart && guard < 40) {
        date = addMonths(date, 12);
        guard++;
      }
      if (date >= windowStart && date <= input.todayISO)
        out.push({ type, date, cycleLabel: `${type}-auto-${date.slice(0, 4)}` });
    }
  }
  return out;
}
