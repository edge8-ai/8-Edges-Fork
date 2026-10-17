// Reads of the kernel's own tables, for the entities that own the question but
// not the data. `companies` is a kernel table because identity resolves who is
// signed in and which company they belong to, so every surface needs it and no
// entity may own it (docs/engineering/entities.md, "kernel tables"). The helper
// names the table and returns the PostgREST builder, so the caller keeps its own
// columns, filters and error handling and the table-ownership gate sees the read
// attributed to the kernel rather than as a raw cross-entity `.from(...)`.
import { companyOs } from "@/kernel/data/supabase";

// PostgREST infers a row shape from a *literal* column list. This helper takes a
// plain `string` so the caller keeps its own columns, which erases that
// inference, and a generic column parameter sends tsc into a combinatorial
// blow-up over PostgREST's conditional types. Naming the result as an open
// record instead keeps every caller's existing `as SomeRow[]` cast working.
type Row = Record<string, unknown>;

export const selectCompanies = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("companies").select<string, Row>(columns, options);
