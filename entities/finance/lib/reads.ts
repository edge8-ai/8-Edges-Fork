// The reads other entities may make of finance's tables. The helper names the
// table and returns the PostgREST builder, so the caller keeps its own columns
// and filters and the table-ownership gate sees the read attributed to the
// owner rather than as a raw cross-entity `.from(...)`.
import { companyOs } from "@/kernel/data/supabase";

// PostgREST infers a row shape from a *literal* column list. These helpers take
// a plain `string` so the caller keeps its own columns, which erases that
// inference, and a generic column parameter sends tsc into a combinatorial
// blow-up over PostgREST's conditional types. Naming the result as an open
// record instead keeps every caller's existing `as SomeRow[]` cast working.
type Row = Record<string, unknown>;

export const selectInvoices = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("invoices").select<string, Row>(columns, options);

export const selectProducts = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("products").select<string, Row>(columns, options);

export const selectContractorPayments = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("contractor_payments").select<string, Row>(columns, options);

export const selectExpenses = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("expenses").select<string, Row>(columns, options);

// The currency table the cost side of a forecast converts through: a cost in
// another currency must reach a dollar figure, because silently dropping it
// makes every runway longer than it is.
export const selectFxRates = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("fx_rates").select<string, Row>(columns, options);

export const selectVendors = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("vendors").select<string, Row>(columns, options);

export const selectQboConnection = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("qbo_connection").select<string, Row>(columns, options);

export const selectCompensationSensitive = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("compensation_sensitive").select<string, Row>(columns, options);

// One person's own payslips: the team assistant's my_pay tool reads the lines
// filtered to the signed-in member and the runs they belong to.
export const selectPayrollLinesSensitive = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("payroll_lines_sensitive").select<string, Row>(columns, options);

export const selectPayrollRunsSensitive = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("payroll_runs_sensitive").select<string, Row>(columns, options);
