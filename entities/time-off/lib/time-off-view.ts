// The employee Time Off page's facts (TH.6), computed on the server from the
// balance, the policy and the rows so the browser receives plain values. Pure:
// no reads here, so each rule is tested without a database.
import { hoursToDays, type LeaveBalance } from "./balance";
import { countWorkingDays } from "./leave";
import type { LeavePolicySummary } from "./policy";

/**
 * Whether a policy keeps leave apart by type, which is what the calendar-first
 * page (its type chips, its ring per type) is drawn for (TH.26). It does when
 * the policy accrues into a bank that holds one type, so every other type is
 * counted on its own. A pooled PTO bank (vacation, sick and personal drawn from
 * one balance) does not, and nor does a policy that accrues nothing; both get
 * the plain page. Read from the policy's rules rather than its name, so a new
 * policy lands on the right page without a code change.
 */
export function tracksLeaveByType(policy: LeavePolicySummary | null): boolean {
  if (!policy) return false;
  return policy.accrual.cadence !== "none" && policy.accrual.bankLeaveTypes.length === 1;
}

export type BalanceFacts = {
  /**
   * Days still free to book: the balance today less approved leave already
   * booked for later this policy year. Negative when leave was taken or booked
   * ahead of accrual.
   */
  available: number;
  hoursAvailable: number;
  earned: number;
  carriedIn: number;
  accrued: number;
  taken: number;
  pending: number;
  /** Approved days booked for later this policy year, already out of `available`. */
  booked: number;
  next: { days: number; date: string } | null;
  /** The last day this year's days can be used, when some would be forfeited. */
  useBy: { date: string; atRiskDays: number } | null;
  carriesOver: boolean;
  ratePerYear: number | null;
};

/** The calendar day before `iso` (YYYY-MM-DD), read as a date, not a time. */
export function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function balanceFacts(b: LeaveBalance, hoursPerDay: number, carryCapHours: number | null): BalanceFacts {
  const days = (h: number) => hoursToDays(h, hoursPerDay);
  const free = Math.round((b.remainingHours - b.bookedHours) * 100) / 100;
  // Booked days fall before the year closes, so they spend hours the cap
  // check would otherwise forfeit: only what is left after them is at risk.
  const atRisk = b.nextCapCheck ? Math.max(0, b.nextCapCheck.atRiskHours - b.bookedHours) : 0;
  return {
    available: days(free),
    hoursAvailable: free,
    earned: days(b.openingHours + b.accruedPolicyYearHours),
    carriedIn: days(b.openingHours),
    accrued: days(b.accruedPolicyYearHours),
    taken: days(b.usedPolicyYearHours),
    pending: days(b.pendingHours),
    booked: days(b.bookedHours),
    next: b.nextAccrual ? { days: days(b.nextAccrual.hours), date: b.nextAccrual.date } : null,
    useBy:
      b.nextCapCheck && atRisk > 0
        ? { date: dayBefore(b.nextCapCheck.date), atRiskDays: days(atRisk) }
        : null,
    carriesOver: carryCapHours !== 0,
    ratePerYear: b.tier ? days(b.tier.hoursPerYear) : null,
  };
}

const isWeekend = (iso: string) => {
  const w = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return w === 0 || w === 6;
};

/** Every day from `from` to `to`, both included. */
function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

/**
 * Who is out on each working day of the window: names only, one entry per
 * person, never on a weekend or a closed holiday, and never the viewer, whose
 * own leave the calendar draws by type instead.
 */
export function outByDay(
  spans: { personId: string; name: string; start: string; end: string }[],
  from: string,
  to: string,
  closed: ReadonlySet<string>,
  viewerPersonId: string | null,
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const s of spans) {
    if (s.personId === viewerPersonId) continue;
    const a = s.start > from ? s.start : from;
    const b = s.end < to ? s.end : to;
    if (a > b) continue;
    for (const iso of eachDay(a, b)) {
      if (isWeekend(iso) || closed.has(iso)) continue;
      const names = (map[iso] ??= []);
      if (!names.includes(s.name)) names.push(s.name);
    }
  }
  return map;
}

export type OwnLeaveRow = {
  id: string;
  leaveType: string;
  status: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  reason: string | null;
  days: number | null;
};

const LIVE = new Set(["requested", "approved", "taken"]);

/** The viewer's own leave on each working day: its type and whether it is still waiting. */
export function ownByDay(rows: OwnLeaveRow[], closed: ReadonlySet<string>): Record<string, { type: string; pending: boolean }> {
  const map: Record<string, { type: string; pending: boolean }> = {};
  for (const r of rows) {
    if (!LIVE.has(r.status)) continue;
    for (const iso of eachDay(r.startDate, r.endDate)) {
      if (isWeekend(iso) || closed.has(iso)) continue;
      map[iso] = { type: r.leaveType, pending: r.status === "requested" };
    }
  }
  return map;
}

/** Working days taken or booked per leave type since `since` (the policy year's start). */
export function daysByType(rows: OwnLeaveRow[], since: string | null, holidays: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.status !== "approved" && r.status !== "taken") continue;
    if (since && r.endDate < since) continue;
    const n = r.days ?? countWorkingDays(r.startDate, r.endDate, r.isHalfDay, holidays);
    out[r.leaveType] = (out[r.leaveType] ?? 0) + n;
  }
  return out;
}

/** Waiting requests, and everything already decided or withdrawn, newest first as given. */
export function splitRequests<T extends { status: string }>(rows: T[]): { pending: T[]; history: T[] } {
  return { pending: rows.filter((r) => r.status === "requested"), history: rows.filter((r) => r.status !== "requested") };
}
