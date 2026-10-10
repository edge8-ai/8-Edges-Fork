// Server-only. The team assistant's "my" tools over the person's own records:
// their time off (with its reason and their manager's note), their pay and
// payslips, and their reimbursement claims (2026-10-10).
//
// The same rule as ./my-work-tools: each body takes the signed-in TeamActor the
// route resolved from the session and reads only that person's rows, filtered
// in the query and again in code. The tool input may narrow a date range and
// nothing else; a person id in it is never read. The workspace time_off tool
// still never selects the reason or the manager note of anybody's leave; this
// one shows them because the leave is the asker's own.

import { mustRows } from "@/kernel/data/read";
import { addDays, saigonToday } from "@/kernel/config/dates";
import { selectPeopleSensitive } from "@/entities/contacts";
import { selectCompensationSensitive, selectPayrollLinesSensitive, selectPayrollRunsSensitive } from "@/entities/finance";
import { listMyClaims } from "@/entities/reimbursements";
import { getMemberLeave, hoursToDays, selectTimeOff } from "@/entities/time-off";
import type { ChatSelf } from "./my-work-tools";
import { ok, text, type ToolInput, type ToolOutcome } from "./shared";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---- my_time_off -------------------------------------------------------------

type MyLeaveRow = {
  team_member_id: string;
  leave_type: string;
  status: string;
  start_date: string;
  end_date: string;
  days: number | null;
  hours: number | null;
  is_half_day: boolean;
  reason: string | null;
  manager_note: string | null;
  requested_at: string | null;
  approved_at: string | null;
};

export async function myTimeOff(input: ToolInput, me: ChatSelf): Promise<ToolOutcome> {
  // By default the last twelve months and everything booked ahead.
  const from = DATE.test(text(input, "from")) ? text(input, "from") : addDays(saigonToday(), -365);
  const to = DATE.test(text(input, "to")) ? text(input, "to") : null;
  let q = selectTimeOff("team_member_id, leave_type, status, start_date, end_date, days, hours, is_half_day, reason, manager_note, requested_at, approved_at")
    .eq("team_member_id", me.teamMemberId)
    .gte("end_date", from);
  if (to) q = q.lte("start_date", to);
  const rows = mustRows(await q.order("start_date", { ascending: false }).limit(100), "[team/chat] my time off") as MyLeaveRow[];

  const leave = (await getMemberLeave([me.teamMemberId])).get(me.teamMemberId) ?? null;
  const b = leave?.balance ?? null;
  const perDay = leave?.policy?.accrual.hoursPerDay ?? 8;
  const days = (h: number) => hoursToDays(h, perDay);

  return ok({
    from,
    to,
    requests: rows
      .filter((r) => r.team_member_id === me.teamMemberId)
      .map((r) => ({
        type: r.leave_type,
        status: r.status,
        start: r.start_date,
        end: r.end_date,
        days: r.days,
        hours: r.hours,
        halfDay: r.is_half_day,
        reason: r.reason,
        managerNote: r.manager_note,
        requestedAt: r.requested_at,
        approvedAt: r.approved_at,
      })),
    balance:
      b && b.hasRules
        ? {
            policy: leave?.policy?.name ?? null,
            hoursPerDay: perDay,
            remainingDays: days(b.remainingHours),
            pendingDays: days(b.pendingHours),
            usedThisPolicyYearDays: days(b.usedPolicyYearHours),
            policyYearStart: b.policyYearStart,
            policyYearEnd: b.policyYearEnd,
            nextAccrual: b.nextAccrual ? { date: b.nextAccrual.date, days: days(b.nextAccrual.hours) } : null,
            atRiskAtCapCheck: b.nextCapCheck ? { date: b.nextCapCheck.date, days: days(b.nextCapCheck.atRiskHours) } : null,
          }
        : null,
    page: "/team/time-off",
  });
}

// ---- my_pay ------------------------------------------------------------------

type CompRow = {
  team_member_id: string;
  comp_type: string;
  pay_period: string;
  amount_cents: number;
  currency: string;
  salary_vnd: number | null;
  salary_usd_cents: number | null;
  effective_from: string;
  effective_to: string | null;
  is_current: boolean;
  change_reason: string | null;
};

type LineRow = Record<string, unknown> & { team_member_id: string; payroll_run_id: string };
type RunRow = { id: string; period: string; status: string; is_estimate: boolean; working_days: number | null; archived_at: string | null };

const PAYSLIP_COLUMNS = [
  "position",
  "on_probation",
  "days_worked",
  "unpaid_leave_days",
  "annual_leave_days",
  "contract_salary_vnd",
  "gross_salary_vnd",
  "lunch_allowance_vnd",
  "phone_allowance_vnd",
  "internet_allowance_vnd",
  "other_allowance_vnd",
  "overtime_hours",
  "overtime_vnd",
  "bonus_vnd",
  "adjustments",
  "total_income_vnd",
  "insurance_base_vnd",
  "employee_si_vnd",
  "employee_hi_vnd",
  "employee_ui_vnd",
  "employer_si_vnd",
  "employer_hi_vnd",
  "employer_ui_vnd",
  "self_deduction_vnd",
  "family_deduction_vnd",
  "dependents",
  "taxable_income_vnd",
  "pit_vnd",
  "other_payable_vnd",
  "other_receivable_vnd",
  "net_salary_vnd",
  "paid_vnd",
] as const;
const PAYSLIPS = 12;

const cents = (v: number | null) => (v === null ? null : Number(v) / 100);

export async function myPay(_input: ToolInput, me: ChatSelf): Promise<ToolOutcome> {
  const [compRes, lineRes, bankRes] = await Promise.all([
    selectCompensationSensitive(
      "team_member_id, comp_type, pay_period, amount_cents, currency, salary_vnd, salary_usd_cents, effective_from, effective_to, is_current, change_reason",
    )
      .eq("team_member_id", me.teamMemberId)
      .order("effective_from", { ascending: false }),
    selectPayrollLinesSensitive(`team_member_id, payroll_run_id, ${PAYSLIP_COLUMNS.join(", ")}`).eq("team_member_id", me.teamMemberId),
    // Only the bank's name and the account number, which is cut to its last
    // four digits below and never handed over whole.
    selectPeopleSensitive("person_id, bank_name, bank_account_number").eq("person_id", me.personId).limit(1),
  ]);
  const comp = (mustRows(compRes, "[team/chat] my compensation") as CompRow[]).filter((c) => c.team_member_id === me.teamMemberId);
  const lines = (mustRows(lineRes, "[team/chat] my payslips") as LineRow[]).filter((l) => l.team_member_id === me.teamMemberId);
  const bank = (mustRows(bankRes, "[team/chat] my bank") as { person_id: string; bank_name: string | null; bank_account_number: string | null }[]).find(
    (r) => r.person_id === me.personId,
  );

  const runIds = [...new Set(lines.map((l) => l.payroll_run_id))];
  const runs = runIds.length
    ? (mustRows(
        await selectPayrollRunsSensitive("id, period, status, is_estimate, working_days, archived_at").in("id", runIds),
        "[team/chat] my payroll runs",
      ) as RunRow[])
    : [];
  const runById = new Map(runs.filter((r) => !r.archived_at).map((r) => [r.id, r]));
  const payslips = lines
    .filter((l) => runById.has(l.payroll_run_id))
    .map((l) => {
      const run = runById.get(l.payroll_run_id) as RunRow;
      const { team_member_id: _tm, payroll_run_id: _run, ...figures } = l;
      return { period: run.period, runStatus: run.status, estimate: run.is_estimate, workingDays: run.working_days, ...figures };
    })
    .sort((a, b) => b.period.localeCompare(a.period))
    .slice(0, PAYSLIPS);

  const digits = (bank?.bank_account_number ?? "").replace(/\D/g, "");
  return ok({
    compensation: comp.map((c) => ({
      type: c.comp_type,
      payPeriod: c.pay_period,
      current: c.is_current,
      effectiveFrom: c.effective_from,
      effectiveTo: c.effective_to,
      salaryVnd: c.salary_vnd,
      salaryUsd: cents(c.salary_usd_cents),
      amount: cents(c.amount_cents),
      currency: c.currency.toUpperCase(),
      changeReason: c.change_reason,
    })),
    payslips,
    moneyNote: "Payslip figures are whole Vietnamese dong (VND).",
    bankAccount: bank ? { bank: bank.bank_name, last4: digits ? digits.slice(-4) : null } : null,
  });
}

// ---- my_reimbursements -------------------------------------------------------

export async function myReimbursements(_input: ToolInput, me: ChatSelf): Promise<ToolOutcome> {
  const claims = await listMyClaims(me.personId);
  return ok({
    claims: claims.map((c) => ({
      title: c.title,
      status: c.status,
      receipts: c.receipts,
      totalVnd: c.totalVnd,
      receiptsAwaitingARate: c.ratePending,
      statusLine: c.line,
      link: `/team/claims/${c.id}`,
    })),
    page: "/team/claims",
  });
}
