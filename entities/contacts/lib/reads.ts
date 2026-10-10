// The reads other entities may make of contacts' tables. The helper names the
// table and returns the PostgREST builder, so the caller keeps its own columns
// and filters and the table-ownership gate sees the read attributed to the
// owner rather than as a raw cross-entity `.from(...)`.
import { companyOs, companyOsUntyped } from "@/kernel/data/supabase";

// PostgREST infers a row shape from a *literal* column list. These helpers take
// a plain `string` so the caller keeps its own columns, which erases that
// inference, and a generic column parameter sends tsc into a combinatorial
// blow-up over PostgREST's conditional types. Naming the result as an open
// record instead keeps every caller's existing `as SomeRow[]` cast working.
type Row = Record<string, unknown>;

export const selectBrands = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("brands").select<string, Row>(columns, options);

export const selectPersonCompanies = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("person_companies").select<string, Row>(columns, options);

export const selectStaffAssignments = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("staff_assignments").select<string, Row>(columns, options);

export const selectAffiliates = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("affiliates").select<string, Row>(columns, options);

export const selectPeopleSensitive = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("people_sensitive").select<string, Row>(columns, options);

export const selectTags = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("tags").select<string, Row>(columns, options);

export const selectTaggables = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("taggables").select<string, Row>(columns, options);

// `brand_contacts` is one of the few names the code reads that the generated
// types snapshot does not carry (see the manifest header), so the table name is
// cast rather than checked. Everything else here is type-checked normally.
export const selectBrandContacts = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOsUntyped.from("brand_contacts").select(columns, options);

