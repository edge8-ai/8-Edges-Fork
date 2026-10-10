// The reads other entities may make of this entity's tables, for the cases
// where the caller owns the question but not the data. The helper names the
// table and returns the PostgREST builder, so the caller keeps its own columns,
// filters and error handling and the table-ownership gate
// (scripts/check-table-ownership.mjs) sees the read attributed to the owner
// rather than as a raw cross-entity `.from(...)`.
import { companyOs } from "@/kernel/data/supabase";

// PostgREST infers a row shape from a *literal* column list. These helpers take
// a plain `string` so the caller keeps its own columns, which erases that
// inference, and a generic column parameter sends tsc into a combinatorial
// blow-up over PostgREST's conditional types. Naming the result as an open
// record instead keeps every caller's existing `as SomeRow[]` cast working.
type Row = Record<string, unknown>;

export const selectAffiliateCommissions = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("affiliate_commissions").select<string, Row>(columns, options);
export const selectBookings = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("bookings").select<string, Row>(columns, options);
export const selectOrders = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("orders").select<string, Row>(columns, options);
// The recurring book. The row carries a `person_id`; a caller forecasting
// revenue must not select it, because a figure about the book is never a
// figure about a person.
export const selectSubscriptions = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("subscriptions").select<string, Row>(columns, options);
