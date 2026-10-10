// The reads other entities may make of onboarding's tables, for the cases where
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

// Where each new starter is in their journey; the admin talent dashboard counts
// the stages.
export const selectOnboardingPlans = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("onboarding_plans").select<string, Row>(columns, options);
// The git address a person's commits are authored with, which HTT matches
// sessions against.
export const selectPersonGitEmails = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("person_git_emails").select<string, Row>(columns, options);
