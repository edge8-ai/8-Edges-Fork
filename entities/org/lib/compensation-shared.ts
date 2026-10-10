// Client-safe salary types + the fixed-rate conversion. No server-only imports
// (compensation.ts, which pulls in the service-role client, re-exports these),
// so the Compensation UI can import from here without dragging secrets into the
// client bundle. Salary is stored in BOTH native VND and USD at a FIXED 25,500
// VND/USD (a constant, not live fx, so history stays reproducible).

// The compensation.comp_type value for a monthly base salary (an allowed value
// in the compensation_comp_type_check constraint).
export const COMP_TYPE_SALARY = "base_salary";

export const FIXED_VND_PER_USD = 25500;

export function vndToUsdCents(vnd: number): number {
  return Math.round((vnd / FIXED_VND_PER_USD) * 100);
}

export function usdCentsToVnd(usdCents: number): number {
  return Math.round((usdCents / 100) * FIXED_VND_PER_USD);
}

export type SalaryRow = {
  id: string;
  salaryVnd: number | null;
  salaryUsdCents: number | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  isCurrent: boolean;
  changeReason: string | null;
  createdAt: string;
};

export type SalaryChangeInput = {
  salaryVnd: number;
  salaryUsdCents: number;
  effectiveFrom: string; // "YYYY-MM-DD"
  changeReason?: string | null;
};
