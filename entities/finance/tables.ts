// The Supabase tables the finance entity owns (design §4; moved off company-os
// by RS-03).
export const FINANCE_TABLES = [
  "compensation_sensitive",
  "contractor_payments",
  "expenses",
  "fx_rates",
  "invoices",
  "payroll_lines_sensitive",
  "payroll_runs_sensitive",
  "products",
  "qbo_connection",
  "vendors",
] as const;
