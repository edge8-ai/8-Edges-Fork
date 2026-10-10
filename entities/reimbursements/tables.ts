// The Supabase tables the reimbursements entity owns (design
// docs/engineering/2026-10-07-reimbursements-design.md, section 1.1). Nobody
// else writes them: every claim transition goes through this entity's
// claim-lifecycle module, and the assistants' SQL roles are revoked.
export const REIMBURSEMENTS_TABLES = [
  "reimbursement_claim_events",
  "reimbursement_claim_items",
  "reimbursement_claims",
  "reimbursement_files",
  "reimbursement_fx_rates",
  "reimbursement_payment_runs",
  "reimbursement_payments",
] as const;
