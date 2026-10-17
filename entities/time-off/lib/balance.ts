// Leave balance arithmetic, computed from a policy's rules
// (plan: private-docs/workflows/private/e8/pto-policies-plan.html).
//
// A policy is a small set of rules: how the service year is counted (calendar
// year or the anniversary of the day probation ended), how often hours post
// (monthly or twice a month), an entitlement per service year that steps up
// with tenure, a carry-over cap applied once a year, and which leave types draw
// from the bank. Everything here is pure: dates in, numbers out, so a test can
// ask "what was this person's balance on a given day" and a page can ask the
// same question for today. Nothing is stored; the ledger is the approved
// time_off rows plus manual leave_adjustments, and the balance is recomputed
// from them on every read.
//
// Hours are the unit inside, because the client policy that motivated this
// accrues 3.34 hours a period; days are hours divided by the policy's day
// length and appear only at the edge, in the numbers a page shows.
import { countWorkingDays, type HolidayDates } from "./leave";
import { addYears, iso, lastDayOfMonth, parse, policyYearFor, serviceYearOn } from "./balance-dates";

export type YearBasis = "calendar" | "anniversary";
export type AccrualCadence = "none" | "monthly" | "semi_monthly";

export type AccrualTier = { fromYear: number; hoursPerYear: number };

export type AccrualPolicy = {
  yearBasis: YearBasis;
  cadence: AccrualCadence;
  // Ordered by fromYear ascending; the tier in force is the last one whose
  // fromYear is at or below the current service year.
  tiers: AccrualTier[];
  hoursPerDay: number;
  // Null means unused hours carry without limit; 0 means nothing carries.
  carryCapHours: number | null;
  minIncrementHours: number;
  bankLeaveTypes: string[];
};

export type UsageRow = {
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  status: string;
  leaveType: string;
  hours: number | null;
  // The day count recorded on the request, when it has one. See usageHours for
  // why a stored count outranks one derived from the dates.
  days?: number | null;
};

export type AdjustmentRow = {
  effectiveDate: string;
  deltaDays: number;
};

export type BalanceInput = {
  policy: AccrualPolicy;
  // The day accrual starts and the service year is counted from: the day the
  // person passed probation (their first labour contract), falling back to
  // their start date when probation is not recorded.
  anniversaryDate: string | null;
  asOf: string;
  usage: UsageRow[];
  adjustments: AdjustmentRow[];
  // The days the office was shut, so a request spanning one does not deduct for
  // it. Only reached for rows carrying neither hours nor a stored day count.
  holidays?: HolidayDates;
  // A known balance on a given day, in hours. When present, nothing dated on or
  // before that day is walked: the anchor stands in for all of it. This is how
  // the 6 July 2026 opening balances are honoured for people whose history the
  // import did not carry in full.
  anchor?: { date: string; hours: number } | null;
};

// One event the balance walked, with the balance after it, so a reviewer can
// check the arithmetic line by line. Hours are signed: postings and positive
// adjustments add, leave and forfeits subtract; the opening line is the balance.
export type LedgerLine = {
  date: string;
  kind: "opening" | "accrual" | "adjustment" | "usage" | "forfeit";
  hours: number;
  balanceHours: number;
  serviceYear?: number;
  leaveType?: string;
  endDate?: string;
};

export type LeaveBalance = {
  // False when the policy has no accrual rules, so callers can fall back.
  hasRules: boolean;
  serviceYear: number;
  // The imported opening balance the walk started from, if any.
  anchorHours: number;
  tier: { hoursPerYear: number; hoursPerPeriod: number } | null;
  accruedHours: number;
  adjustedHours: number;
  usedHours: number;
  // Leave taken in bank types over the member's whole history and within the
  // current policy year (from policyYearStart: the last anniversary on an
  // anniversary policy, 1 January on a calendar one), including what an opening
  // balance absorbed, so a page can show what someone has actually taken.
  usedAllTimeHours: number;
  usedPolicyYearHours: number;
  policyYearStart: string | null;
  // The yearly view a manager reads: what the bank held going into the current
  // policy year (after the carry-over cap ran at its start), and what posted
  // since. Opening + accrued this year + adjustments − used this year − forfeits
  // this year = remaining.
  openingHours: number;
  accruedPolicyYearHours: number;
  adjustedPolicyYearHours: number;
  forfeitedHours: number;
  remainingHours: number;
  pendingHours: number;
  nextAccrual: { date: string; hours: number } | null;
  nextStepUp: { date: string; hoursPerYear: number } | null;
  nextCapCheck: { date: string; atRiskHours: number } | null;
  // Last day of the policy year that contains asOf.
  policyYearEnd: string | null;
  ledger: LedgerLine[];
};

const DEDUCTING_STATUSES = new Set(["approved", "taken"]);

export { serviceYearOn, policyYearFor } from "./balance-dates";

export function tierFor(policy: AccrualPolicy, serviceYear: number): AccrualTier | null {
  let current: AccrualTier | null = null;
  for (const t of policy.tiers) {
    if (t.fromYear <= serviceYear) current = t;
  }
  return current;
}

function periodsPerYear(cadence: AccrualCadence): number {
  return cadence === "semi_monthly" ? 24 : cadence === "monthly" ? 12 : 0;
}

// Every posting date strictly after `from` and at or before `to`.
function accrualDates(cadence: AccrualCadence, from: string, to: string): string[] {
  if (cadence === "none" || to <= from) return [];
  const out: string[] = [];
  const start = parse(from);
  const end = parse(to);
  for (let y = start.getUTCFullYear(); y <= end.getUTCFullYear(); y += 1) {
    const m0 = y === start.getUTCFullYear() ? start.getUTCMonth() : 0;
    const m1 = y === end.getUTCFullYear() ? end.getUTCMonth() : 11;
    for (let m = m0; m <= m1; m += 1) {
      const dates = cadence === "semi_monthly"
        ? [iso(new Date(Date.UTC(y, m, 15))), lastDayOfMonth(y, m)]
        : [lastDayOfMonth(y, m)];
      for (const d of dates) if (d > from && d <= to) out.push(d);
    }
  }
  return out;
}

// Cap-check dates strictly after `from` and at or before `to`: each anniversary
// for anniversary policies, each 1 January for calendar ones.
function capCheckDates(policy: AccrualPolicy, anniversaryDate: string, from: string, to: string): string[] {
  const out: string[] = [];
  if (policy.yearBasis === "anniversary") {
    for (let n = 1; ; n += 1) {
      const d = addYears(anniversaryDate, n);
      if (d > to) break;
      if (d > from) out.push(d);
    }
  } else {
    for (let y = parse(from).getUTCFullYear() + 1; ; y += 1) {
      const d = `${y}-01-01`;
      if (d > to) break;
      if (d > from) out.push(d);
    }
  }
  return out;
}

// Hours a leave row deducts, in order of what the request was actually agreed
// at: its own recorded hours, then its recorded day count, then a count derived
// from the dates.
//
// The stored day count matters because it is the number the request was
// approved for — an imported row already had its holidays excluded by the
// system it came from, and an in-app row recorded what the employee saw when
// they submitted. Recomputing either would silently restate a settled request,
// which is why `days` sits ahead of the derived count rather than behind it.
export function usageHours(row: UsageRow, hoursPerDay: number, holidays?: HolidayDates): number {
  if (row.hours !== null && Number.isFinite(row.hours)) return row.hours;
  if (row.days !== null && row.days !== undefined && Number.isFinite(row.days)) {
    return row.days * hoursPerDay;
  }
  return countWorkingDays(row.startDate, row.endDate, row.isHalfDay, holidays) * hoursPerDay;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeLeaveBalance(input: BalanceInput): LeaveBalance {
  const { policy, asOf } = input;
  const empty: LeaveBalance = {
    hasRules: false,
    serviceYear: 0,
    anchorHours: 0,
    tier: null,
    accruedHours: 0,
    adjustedHours: 0,
    usedHours: 0,
    usedAllTimeHours: 0,
    usedPolicyYearHours: 0,
    openingHours: 0,
    accruedPolicyYearHours: 0,
    adjustedPolicyYearHours: 0,
    policyYearStart: null,
    policyYearEnd: null,
    ledger: [],
    forfeitedHours: 0,
    remainingHours: 0,
    pendingHours: 0,
    nextAccrual: null,
    nextStepUp: null,
    nextCapCheck: null,
  };
  if (policy.cadence === "none" || policy.tiers.length === 0 || !input.anniversaryDate) return empty;
  const anniversary = input.anniversaryDate;
  const bank = new Set(policy.bankLeaveTypes);
  const perYear = periodsPerYear(policy.cadence);
  const anchor = input.anchor ?? null;
  // Nothing dated on or before the anchor is walked; the walk starts there.
  const from = anchor && anchor.date > anniversary ? anchor.date : anniversary;

  // One ordered stream of events. On the same day, the cap check runs first,
  // then hours post, then leave is deducted: the cap closes the old year, so
  // it must not see the new year's first posting (an anniversary that falls on
  // a posting day would otherwise forfeit that posting), and a person who
  // takes leave on an accrual day is never short by that day's posting.
  type Ev = {
    date: string;
    order: number;
    hours: number;
    kind: "accrual" | "adjustment" | "usage" | "cap";
    serviceYear?: number;
    leaveType?: string;
    endDate?: string;
  };
  const events: Ev[] = [];
  let accrued = 0;
  for (const d of accrualDates(policy.cadence, from, asOf)) {
    const serviceYear = serviceYearOn(anniversary, d);
    const tier = tierFor(policy, serviceYear);
    if (!tier) continue;
    events.push({ date: d, order: 0, hours: tier.hoursPerYear / perYear, kind: "accrual", serviceYear });
  }
  for (const a of input.adjustments) {
    if (a.effectiveDate > asOf || a.effectiveDate <= from) continue;
    events.push({ date: a.effectiveDate, order: 1, hours: a.deltaDays * policy.hoursPerDay, kind: "adjustment" });
  }
  let pending = 0;
  let usedAllTime = 0;
  let usedPolicyYear = 0;
  // Before the anniversary date the first policy year is the one coming up.
  const policyYear = policyYearFor(policy.yearBasis, anniversary, asOf < anniversary ? anniversary : asOf)!;
  const policyYearStart = policyYear.start;
  for (const u of input.usage) {
    if (!bank.has(u.leaveType)) continue;
    if (DEDUCTING_STATUSES.has(u.status) && u.startDate <= asOf) {
      const h = usageHours(u, policy.hoursPerDay, input.holidays);
      usedAllTime += h;
      if (u.startDate >= policyYearStart) usedPolicyYear += h;
    }
    if (u.status === "requested") {
      pending += usageHours(u, policy.hoursPerDay, input.holidays);
      continue;
    }
    if (!DEDUCTING_STATUSES.has(u.status) || u.startDate > asOf || u.startDate <= from) continue;
    events.push({
      date: u.startDate,
      order: 2,
      hours: -usageHours(u, policy.hoursPerDay, input.holidays),
      kind: "usage",
      leaveType: u.leaveType,
      endDate: u.endDate,
    });
  }
  for (const d of capCheckDates(policy, anniversary, from, asOf)) {
    events.push({ date: d, order: -1, hours: 0, kind: "cap" });
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order));

  let balance = anchor?.hours ?? 0;
  let adjusted = 0;
  let used = 0;
  let forfeited = 0;
  // The balance carried into the current policy year: what stood once the cap
  // dated on its first day had run (the cap closes the old year) and before
  // anything else that day. Null until the walk reaches the year.
  let opening: number | null = null;
  let accruedPolicyYear = 0;
  let adjustedPolicyYear = 0;
  const ledger: LedgerLine[] = anchor
    ? [{ date: anchor.date, kind: "opening", hours: round2(anchor.hours), balanceHours: round2(anchor.hours) }]
    : [];
  for (const e of events) {
    if (opening === null && e.date >= policyYearStart && e.kind !== "cap") opening = balance;
    if (e.kind === "cap") {
      if (policy.carryCapHours !== null && balance > policy.carryCapHours) {
        const lost = balance - policy.carryCapHours;
        forfeited += lost;
        balance = policy.carryCapHours;
        ledger.push({ date: e.date, kind: "forfeit", hours: round2(-lost), balanceHours: round2(balance) });
      }
      if (opening === null && e.date >= policyYearStart) opening = balance;
      continue;
    }
    balance += e.hours;
    if (e.kind === "accrual") {
      accrued += e.hours;
      if (e.date >= policyYearStart) accruedPolicyYear += e.hours;
    } else if (e.kind === "adjustment") {
      adjusted += e.hours;
      if (e.date >= policyYearStart) adjustedPolicyYear += e.hours;
    }
    else used += -e.hours;
    ledger.push({
      date: e.date,
      kind: e.kind as Exclude<Ev["kind"], "cap">,
      hours: round2(e.hours),
      balanceHours: round2(balance),
      serviceYear: e.serviceYear,
      leaveType: e.leaveType,
      endDate: e.endDate,
    });
  }

  const serviceYear = serviceYearOn(anniversary, asOf);
  const tierNow = tierFor(policy, serviceYear);

  // What comes next, for the card: the next posting, the next tier change and
  // the next cap check with the hours that would be lost if nothing were taken.
  const horizon = addYears(asOf, 2);
  const nextAccrualDate = accrualDates(policy.cadence, asOf, horizon)[0] ?? null;
  const nextAccrualTier = nextAccrualDate ? tierFor(policy, serviceYearOn(anniversary, nextAccrualDate)) : null;
  let nextStepUp: LeaveBalance["nextStepUp"] = null;
  for (const t of policy.tiers) {
    if (t.fromYear > serviceYear) {
      nextStepUp = { date: addYears(anniversary, t.fromYear - 1), hoursPerYear: t.hoursPerYear };
      break;
    }
  }
  const nextCapDate = policy.carryCapHours === null
    ? null
    : (capCheckDates(policy, anniversary, asOf, horizon)[0] ?? null);

  return {
    hasRules: true,
    serviceYear,
    anchorHours: round2(anchor?.hours ?? 0),
    tier: tierNow ? { hoursPerYear: tierNow.hoursPerYear, hoursPerPeriod: round2(tierNow.hoursPerYear / perYear) } : null,
    accruedHours: round2(accrued),
    adjustedHours: round2(adjusted),
    usedHours: round2(used),
    usedAllTimeHours: round2(usedAllTime),
    usedPolicyYearHours: round2(usedPolicyYear),
    policyYearStart,
    openingHours: round2(opening ?? balance),
    accruedPolicyYearHours: round2(accruedPolicyYear),
    adjustedPolicyYearHours: round2(adjustedPolicyYear),
    forfeitedHours: round2(forfeited),
    remainingHours: round2(balance),
    pendingHours: round2(pending),
    nextAccrual: nextAccrualDate && nextAccrualTier
      ? { date: nextAccrualDate, hours: round2(nextAccrualTier.hoursPerYear / perYear) }
      : null,
    nextStepUp,
    nextCapCheck: nextCapDate
      ? { date: nextCapDate, atRiskHours: round2(Math.max(0, balance - (policy.carryCapHours ?? 0))) }
      : null,
    policyYearEnd: policyYear.end,
    ledger,
  };
}

export function hoursToDays(hours: number, hoursPerDay: number): number {
  return hoursPerDay > 0 ? Math.round((hours / hoursPerDay) * 100) / 100 : 0;
}
