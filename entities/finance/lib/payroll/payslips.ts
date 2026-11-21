// A team member's own payslips, for the team assistant's my_pay tool (A.65,
// ADR 0018). CONFIDENTIAL: the caller asks only with the signed-in member's
// own team-member id. The payslip columns are the ones that tool read before
// this card, no more (H1-DESIGN rule 7): never the source spreadsheet row or
// the import bookkeeping.
import { companyOs } from "@/kernel/data/supabase";

/** One team member's payslip lines, every run, with the figures a payslip shows. */
export async function payslipLinesOf(teamMemberId: string) {
  return companyOs
    .from("payroll_lines_sensitive")
    .select(
      "team_member_id, payroll_run_id, position, on_probation, days_worked, unpaid_leave_days, annual_leave_days, contract_salary_vnd, gross_salary_vnd, lunch_allowance_vnd, phone_allowance_vnd, internet_allowance_vnd, other_allowance_vnd, overtime_hours, overtime_vnd, bonus_vnd, adjustments, total_income_vnd, insurance_base_vnd, employee_si_vnd, employee_hi_vnd, employee_ui_vnd, employer_si_vnd, employer_hi_vnd, employer_ui_vnd, self_deduction_vnd, family_deduction_vnd, dependents, taxable_income_vnd, pit_vnd, other_payable_vnd, other_receivable_vnd, net_salary_vnd, paid_vnd",
    )
    .eq("team_member_id", teamMemberId);
}

/** The payroll runs these lines belong to: period, status and whether the run was archived. */
export async function payrollRunsIn(runIds: string[]) {
  return companyOs.from("payroll_runs_sensitive").select("id, period, status, is_estimate, working_days, archived_at").in("id", runIds);
}
