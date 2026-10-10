// Thin writes of this entity's tables: the verb of each statement, returning
// the builder so the caller adds its own guards (`.eq("status", from)`, the
// owner's person id) and its own `.select(...)`. The rules about WHEN a write
// may happen live in claim-lifecycle, claim-items, claim-files and
// own-bank-details (the owner's bank confirmation on a claim), which are the
// only callers; nothing outside this entity writes these tables.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";

export const insertReimbursementClaims = (row: TablesInsert<{ schema: "company_os" }, "reimbursement_claims">) =>
  companyOs.from("reimbursement_claims").insert(row);
export const updateReimbursementClaims = (patch: TablesUpdate<{ schema: "company_os" }, "reimbursement_claims">) =>
  companyOs.from("reimbursement_claims").update(patch);
export const deleteReimbursementClaims = () => companyOs.from("reimbursement_claims").delete();

export const insertReimbursementClaimItems = (row: TablesInsert<{ schema: "company_os" }, "reimbursement_claim_items">) =>
  companyOs.from("reimbursement_claim_items").insert(row);
export const updateReimbursementClaimItems = (patch: TablesUpdate<{ schema: "company_os" }, "reimbursement_claim_items">) =>
  companyOs.from("reimbursement_claim_items").update(patch);
export const deleteReimbursementClaimItems = () => companyOs.from("reimbursement_claim_items").delete();

export const insertReimbursementFiles = (row: TablesInsert<{ schema: "company_os" }, "reimbursement_files">) =>
  companyOs.from("reimbursement_files").insert(row);
export const updateReimbursementFiles = (patch: TablesUpdate<{ schema: "company_os" }, "reimbursement_files">) =>
  companyOs.from("reimbursement_files").update(patch);
export const deleteReimbursementFiles = () => companyOs.from("reimbursement_files").delete();

// The history is append-only (a database trigger refuses update and delete), so
// there is no update or delete helper to reach for.
export const insertReimbursementClaimEvents = (row: TablesInsert<{ schema: "company_os" }, "reimbursement_claim_events">) =>
  companyOs.from("reimbursement_claim_events").insert(row);

// One run per date: building a run again on the same day finds the row the
// first build wrote (design §1.7), so the cron and the payer's button are safe
// to press twice. Nothing deletes a run or a payment.
export const upsertReimbursementPaymentRuns = (row: TablesInsert<{ schema: "company_os" }, "reimbursement_payment_runs">) =>
  companyOs.from("reimbursement_payment_runs").upsert(row, { onConflict: "run_date" });
export const updateReimbursementPaymentRuns = (patch: TablesUpdate<{ schema: "company_os" }, "reimbursement_payment_runs">) =>
  companyOs.from("reimbursement_payment_runs").update(patch);

export const insertReimbursementPayments = (row: TablesInsert<{ schema: "company_os" }, "reimbursement_payments">) =>
  companyOs.from("reimbursement_payments").insert(row);
export const updateReimbursementPayments = (patch: TablesUpdate<{ schema: "company_os" }, "reimbursement_payments">) =>
  companyOs.from("reimbursement_payments").update(patch);

// One row per (day, currency, source): a bank's answer asked again, or a
// checker's corrected manual rate, replaces the row rather than adding one.
export const upsertReimbursementFxRates = (row: TablesInsert<{ schema: "company_os" }, "reimbursement_fx_rates">) =>
  companyOs.from("reimbursement_fx_rates").upsert(row, { onConflict: "rate_date,currency,source" });
