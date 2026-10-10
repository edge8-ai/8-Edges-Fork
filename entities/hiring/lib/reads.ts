// The reads other entities may make of hiring's tables. The helper names the
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

export const selectApplicationStages = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("application_stages").select<string, Row>(columns, options);
export const selectApplications = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("applications").select<string, Row>(columns, options);
export const selectInterviewInterviewers = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("interview_interviewers").select<string, Row>(columns, options);
export const selectInterviewScorecards = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("interview_scorecards").select<string, Row>(columns, options);
export const selectInterviews = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("interviews").select<string, Row>(columns, options);
export const selectJobRequisitions = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("job_requisitions").select<string, Row>(columns, options);
