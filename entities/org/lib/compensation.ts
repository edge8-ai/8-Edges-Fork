// Server-only data layer for confidential employee salaries
// (company_os.compensation, comp_type = 'base_salary'). CONFIDENTIAL: callers
// MUST gate on the people.pay atom before invoking any of this — authorization
// is the caller's job. Salary is stored in BOTH native VND (salary_vnd, whole
// VND) and USD (salary_usd_cents), converted at a FIXED 25,500 VND/USD (not live
// fx). History is append-only: a change closes the current row and inserts a new
// one; rows are never mutated in place, so the full wage history is preserved.
// Finance owns the rows, so it asks which rows are a salary and performs the
// write (A.65); this module shapes them for the Compensation screen.

import { recordSalaryChange, salaryHistory } from "@/entities/finance";
import type { SalaryRow, SalaryChangeInput } from "./compensation-shared";

// Pure types + the fixed-rate conversion live in ./compensation-shared
// (client-safe) and are re-exported here so server callers keep one import.
export * from "./compensation-shared";

type Row = {
  id: string;
  salary_vnd: number | string | null;
  salary_usd_cents: number | string | null;
  effective_from: string | null;
  effective_to: string | null;
  is_current: boolean;
  change_reason: string | null;
  created_at: string;
};

const num = (v: number | string | null): number | null =>
  v === null || v === "" ? null : Number(v);

function mapRow(r: Row): SalaryRow {
  return {
    id: r.id,
    salaryVnd: num(r.salary_vnd),
    salaryUsdCents: num(r.salary_usd_cents),
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
    isCurrent: r.is_current,
    changeReason: r.change_reason,
    createdAt: r.created_at,
  };
}

export async function getSalaryHistory(teamMemberId: string): Promise<SalaryRow[]> {
  const { data, error } = await salaryHistory(teamMemberId);
  if (error) {
    console.error("getSalaryHistory failed:", error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

// Append-only: close the current salary row(s), then insert the new one. The old
// row keeps its amounts and gets effective_to = the new row's effective_from.
// The approver is recorded in the audit log by the caller (compensation.approved_by
// is a uuid column, not an email, so we leave it null).
export async function saveSalaryChange(
  teamMemberId: string,
  input: SalaryChangeInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  return recordSalaryChange(teamMemberId, input);
}
