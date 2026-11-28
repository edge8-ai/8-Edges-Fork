// The Supabase tables the billing entity owns (design §4).
//
// Ownership means billing is the only entity that writes these directly;
// everyone else goes through this entity's index.ts or an RPC. The gate that
// enforces it (scripts/check-table-ownership.mjs) reads the same list from the
// `tables` array on `billing` in entities.manifest.json, because the gate runs
// on a fresh checkout with no TypeScript toolchain. This file is the in-code
// half of that declaration, and tables.test.ts fails if the two ever disagree.
export const BILLING_TABLES = [
  "affiliate_commissions",
  "affiliate_payouts",
  "bookings",
  "orders",
  "subscriptions",
  "token_purchases",
] as const;
