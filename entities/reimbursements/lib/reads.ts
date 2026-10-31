// Thin reads of this entity's tables. Each returns the PostgREST builder so the
// caller keeps its own filters, ordering and error handling; logic lives in the
// modules beside this one, never here.
import { companyOs } from "@/kernel/data/supabase";

// The column list is a plain `string`, so the caller states the row shape, as
// every entity's read helpers do (see entities/time-off/lib/reads.ts).
type Row = Record<string, unknown>;

/** `options` carries a head-only count (`{ count: "exact", head: true }`): the tab counts read no rows (RB.14). */
export const selectReimbursementClaims = (columns: string, options?: { count?: "exact"; head?: boolean }) =>
  companyOs.from("reimbursement_claims").select<string, Row>(columns, options);

export const selectReimbursementClaimItems = (columns: string) =>
  companyOs.from("reimbursement_claim_items").select<string, Row>(columns);

export const selectReimbursementFiles = (columns: string) =>
  companyOs.from("reimbursement_files").select<string, Row>(columns);

export const selectReimbursementClaimEvents = (columns: string) =>
  companyOs.from("reimbursement_claim_events").select<string, Row>(columns);

export const selectReimbursementFxRates = (columns: string) =>
  companyOs.from("reimbursement_fx_rates").select<string, Row>(columns);

export const selectReimbursementPaymentRuns = (columns: string) =>
  companyOs.from("reimbursement_payment_runs").select<string, Row>(columns);

export const selectReimbursementPayments = (columns: string) =>
  companyOs.from("reimbursement_payments").select<string, Row>(columns);
