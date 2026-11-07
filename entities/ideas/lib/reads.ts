// ideas' own raw readers, private to the entity since A.70 (ADR 0018): the
// door no longer re-exports this file, and another entity asks a named
// question instead (idea-lookups.ts). Each helper names the table and returns
// the PostgREST builder, so the ideas file calling it keeps its own columns and
// filters.
import { companyOs } from "@/kernel/data/supabase";

// PostgREST infers a row shape from a *literal* column list. These helpers take
// a plain `string` so the caller keeps its own columns, which erases that
// inference, and a generic column parameter sends tsc into a combinatorial
// blow-up over PostgREST's conditional types. Naming the result as an open
// record instead keeps every caller's existing `as SomeRow[]` cast working.
type Row = Record<string, unknown>;

export const selectIdeas = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("ideas").select<string, Row>(columns, options);
export const selectIdeaReactions = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("idea_reactions").select<string, Row>(columns, options);
export const selectIdeaBuilds = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("idea_builds").select<string, Row>(columns, options);
export const selectIdeaTrendReports = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("idea_trend_reports").select<string, Row>(columns, options);
