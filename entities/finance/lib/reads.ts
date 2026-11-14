// Finance's own raw reads of its tables. The helper names the table and
// returns the PostgREST builder, so the caller keeps its own columns and
// filters. Since card A.65 (ADR 0018) these are private to finance: other
// entities ask the questions its door exports instead. selectProducts, the
// last one the door re-exported, went with card A.72: products are read
// through the questions in ./products.ts and ./event-tiers.ts.
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
