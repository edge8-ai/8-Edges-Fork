// The reads other entities may make of coaching's tables, for the cases where
// the caller owns the question but not the data. The helper names the table and
// returns the PostgREST builder, so the caller keeps its own columns, filters
// and error handling and the table-ownership gate
// (scripts/check-table-ownership.mjs) sees the read attributed to the owner
// rather than as a raw cross-entity `.from(...)`.
import { companyOs } from "@/kernel/data/supabase";

// PostgREST infers a row shape from a *literal* column list. These helpers take
// a plain `string` so the caller keeps its own columns, which erases that
// inference, and a generic column parameter sends tsc into a combinatorial
// blow-up over PostgREST's conditional types. Naming the result as an open
// record instead keeps every caller's existing `as SomeRow[]` cast working.
type Row = Record<string, unknown>;

// Personal goals, which the company-goals roll-up in team reads alongside org's
// objectives.
export const selectGoals = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("goals").select<string, Row>(columns, options);
// Coaching state on the admin team shelf and in the review scheduler: who has a
// coach and when they last met.
export const selectCoachingProfiles = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("coaching_profiles").select<string, Row>(columns, options);
export const selectCoachingOneOnOnes = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("coaching_one_on_ones").select<string, Row>(columns, options);
