// The reads other entities may make of crm's tables. The helper names the
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

export const selectCallTranscripts = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("call_transcripts").select<string, Row>(columns, options);
export const selectDeals = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("deals").select<string, Row>(columns, options);
export const selectInquiries = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("inquiries").select<string, Row>(columns, options);
export const selectLead = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("lead").select<string, Row>(columns, options);
export const selectMeetingActionItems = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("meeting_action_items").select<string, Row>(columns, options);
export const selectMeetings = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("meetings").select<string, Row>(columns, options);
export const selectPipelineStages = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("pipeline_stages").select<string, Row>(columns, options);
export const selectPipelines = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("pipelines").select<string, Row>(columns, options);
