// The reads other entities may make of client-programs' tables. The helper names the
// table and returns the PostgREST builder, so the caller keeps its own columns
// and filters and the table-ownership gate sees the read attributed to the
// owner rather than as a raw cross-entity `.from(...)`.
import { companyOs } from "@/kernel/data/supabase";

// PostgREST infers a row shape from a *literal* column list. These helpers take
// a plain `string` so the caller keeps its own columns, which erases that
// inference, and a generic column parameter sends tsc into a combinatorial
// blow-up over PostgREST's conditional types. Naming the result as an open
// record instead keeps every caller's existing `as SomeRow[]` cast working.
type Row = Record<string, unknown>;

export const selectAiPrograms = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("ai_programs").select<string, Row>(columns, options);

export const selectClientBacklogItems = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("client_backlog_items").select<string, Row>(columns, options);

export const selectClientRoadmapGroups = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("client_roadmap_groups").select<string, Row>(columns, options);

export const selectClientRoadmapOverview = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("client_roadmap_overview").select<string, Row>(columns, options);
export const selectProgramDocuments = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("program_documents").select<string, Row>(columns, options);
