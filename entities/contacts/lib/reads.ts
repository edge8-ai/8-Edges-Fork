// Contacts' own raw readers, private to this entity since A.64 (ADR 0018):
// the door no longer re-exports this file. Other entities ask the named
// questions in lib/person-companies.ts, lib/staff-assignments.ts,
// lib/affiliates.ts, lib/people-sensitive.ts, lib/brands.ts and lib/tags.ts.
import { companyOs } from "@/kernel/data/supabase";

// PostgREST infers a row shape from a *literal* column list. These helpers take
// a plain `string`, which erases that inference, and a generic column
// parameter sends tsc into a combinatorial blow-up over PostgREST's
// conditional types. Naming the result as an open record instead keeps the
// staff-assignment readers' existing casts working.
type Row = Record<string, unknown>;

export const selectPersonCompanies = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("person_companies").select<string, Row>(columns, options);

export const selectStaffAssignments = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("staff_assignments").select<string, Row>(columns, options);
