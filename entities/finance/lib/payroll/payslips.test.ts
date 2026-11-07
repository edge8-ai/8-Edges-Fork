import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, resetQueries } from "../testing/query-log";

vi.mock("@/kernel/data/supabase", async () => ({ companyOs: (await import("../testing/query-log")).recordingClient }));

import { payrollRunsIn, payslipLinesOf } from "./payslips";

// A.65: the queries the team assistant's my_pay tool built by hand around
// selectPayrollLinesSensitive and selectPayrollRunsSensitive before the card.
// Payslips are pay data, so the columns are exactly the tool's old list,
// which is spelled out here as it stood rather than read from the module.
const PAYSLIP_COLUMNS = [
  "position", "on_probation", "days_worked", "unpaid_leave_days", "annual_leave_days", "contract_salary_vnd", "gross_salary_vnd",
  "lunch_allowance_vnd", "phone_allowance_vnd", "internet_allowance_vnd", "other_allowance_vnd", "overtime_hours", "overtime_vnd",
  "bonus_vnd", "adjustments", "total_income_vnd", "insurance_base_vnd", "employee_si_vnd", "employee_hi_vnd", "employee_ui_vnd",
  "employer_si_vnd", "employer_hi_vnd", "employer_ui_vnd", "self_deduction_vnd", "family_deduction_vnd", "dependents",
  "taxable_income_vnd", "pit_vnd", "other_payable_vnd", "other_receivable_vnd", "net_salary_vnd", "paid_vnd",
];

beforeEach(() => resetQueries());

describe("finance's payslip questions make the my_pay tool's queries", () => {
  it("reads one member's payslip lines with exactly the columns a payslip shows", async () => {
    await payslipLinesOf("tm-1");
    expect(queries).toEqual([
      {
        table: "payroll_lines_sensitive",
        steps: [["select", `team_member_id, payroll_run_id, ${PAYSLIP_COLUMNS.join(", ")}`], ["eq", "team_member_id", "tm-1"]],
      },
    ]);
  });

  it("reads the runs those lines belong to", async () => {
    await payrollRunsIn(["run-1"]);
    expect(queries).toEqual([
      { table: "payroll_runs_sensitive", steps: [["select", "id, period, status, is_estimate, working_days, archived_at"], ["in", "id", ["run-1"]]] },
    ]);
  });
});
