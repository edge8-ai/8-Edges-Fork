// crm's own thin table helpers. Private to the entity since A.63: the door
// no longer re-exports them, and another entity asks one of the named
// questions in the concept files (meeting-records.ts, deals.ts, ...) instead
// of choosing crm's columns and filters itself.
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
export const selectMeetings = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("meetings").select<string, Row>(columns, options);
export const selectPipelineStages = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("pipeline_stages").select<string, Row>(columns, options);
