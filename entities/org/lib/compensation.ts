// Server-only data layer for confidential employee salaries
// (company_os.compensation, comp_type = 'base_salary'). CONFIDENTIAL: callers
// MUST gate on the people.pay atom before invoking any of this — authorization
// is the caller's job. Salary is stored in BOTH native VND (salary_vnd, whole
// VND) and USD (salary_usd_cents), converted at a FIXED 25,500 VND/USD (not live
// fx). History is append-only: a change closes the current row and inserts a new
// one; rows are never mutated in place, so the full wage history is preserved.

import { companyOs } from "@/kernel/data/supabase";
import { updateCompensationSensitive, insertCompensationSensitive, selectCompensationSensitive } from "@/entities/finance";
import { COMP_TYPE_SALARY, type SalaryRow, type SalaryChangeInput } from "./compensation-shared";

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

const SALARY_COLS =
  "id, salary_vnd, salary_usd_cents, effective_from, effective_to, is_current, change_reason, created_at";

export async function getSalaryHistory(teamMemberId: string): Promise<SalaryRow[]> {
  const { data, error } = await selectCompensationSensitive(SALARY_COLS)
    .eq("team_member_id", teamMemberId)
    .eq("comp_type", COMP_TYPE_SALARY)
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    console.error("getSalaryHistory failed:", error.message);
    return [];
  }
  return (data as Row[]).map(mapRow);
}

// Append-only: close the current salary row(s), then insert the new one. The old
// row keeps its amounts and gets effective_to = the new row's effective_from.
// The approver is recorded in the audit log by the caller (compensation.approved_by
// is a uuid column, not an email, so we leave it null).
export async function saveSalaryChange(
  teamMemberId: string,
  input: SalaryChangeInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const now = new Date().toISOString();

  const { error: closeErr } = await updateCompensationSensitive({ is_current: false, effective_to: input.effectiveFrom, updated_at: now })
    .eq("team_member_id", teamMemberId)
    .eq("comp_type", COMP_TYPE_SALARY)
    .eq("is_current", true);
  if (closeErr) return { ok: false, error: closeErr.message };

  const { data, error } = await insertCompensationSensitive({
      team_member_id: teamMemberId,
      comp_type: COMP_TYPE_SALARY,
      pay_period: "monthly",
      // Generic columns kept consistent (USD) so non-salary readers see a value.
      amount_cents: input.salaryUsdCents,
      currency: "usd",
      // Dedicated dual-currency salary columns (the record of truth).
      salary_vnd: input.salaryVnd,
      salary_usd_cents: input.salaryUsdCents,
      effective_from: input.effectiveFrom,
      is_current: true,
      change_reason: input.changeReason ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: string }).id };
}
