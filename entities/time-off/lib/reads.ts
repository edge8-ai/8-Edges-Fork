// time-off's own raw reader, private to the entity since A.70 (ADR 0018): the
// door no longer re-exports this file, and another entity asks a named
// question instead (leave-lookups.ts). The helper names the table and returns
// the PostgREST builder, so the time-off file calling it keeps its own columns,
// filters and error handling.
import { companyOs } from "@/kernel/data/supabase";

// PostgREST infers a row shape from a *literal* column list. These helpers take
// a plain `string` so the caller keeps its own columns, which erases that
// inference, and a generic column parameter sends tsc into a combinatorial
// blow-up over PostgREST's conditional types. Naming the result as an open
// record instead keeps every caller's existing `as SomeRow[]` cast working.
type Row = Record<string, unknown>;

// The column list is a plain `string`, so PostgREST cannot infer the row shape
// and the caller states it — exactly as these call sites already did with their
// own `as` casts. Making it generic restores inference but sends tsc into a
// combinatorial blow-up over PostgREST's conditional types, so it stays wide.

export const selectTimeOff = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("time_off").select<string, Row>(columns, options);
