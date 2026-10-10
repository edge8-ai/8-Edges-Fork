// The writes other entities may make to crm's tables (design §4, ME-13).
// Only the owner writes its tables directly; everyone else calls one of these
// through the entity's index, so the table-ownership gate sees no raw
// cross-entity write. Each writer returns the PostgREST builder so the caller
// keeps its own filters and error handling.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";

export const upsertCallTranscripts = (
  row: TablesInsert<{ schema: "company_os" }, "call_transcripts"> | TablesInsert<{ schema: "company_os" }, "call_transcripts">[],
  options?: { onConflict?: string; ignoreDuplicates?: boolean },
) => companyOs.from("call_transcripts").upsert(row, options);
export const insertDeals = (row: TablesInsert<{ schema: "company_os" }, "deals"> | TablesInsert<{ schema: "company_os" }, "deals">[]) => companyOs.from("deals").insert(row);
export const updateDeals = (patch: TablesUpdate<{ schema: "company_os" }, "deals">) => companyOs.from("deals").update(patch);
export const deleteDeals = () => companyOs.from("deals").delete();
export const insertInquiries = (row: TablesInsert<{ schema: "company_os" }, "inquiries"> | TablesInsert<{ schema: "company_os" }, "inquiries">[]) => companyOs.from("inquiries").insert(row);
export const updateInquiries = (patch: TablesUpdate<{ schema: "company_os" }, "inquiries">) => companyOs.from("inquiries").update(patch);
export const upsertLead = (
  row: TablesInsert<{ schema: "company_os" }, "lead"> | TablesInsert<{ schema: "company_os" }, "lead">[],
  options?: { onConflict?: string; ignoreDuplicates?: boolean },
) => companyOs.from("lead").upsert(row, options);
export const insertLifecycleTransitions = (row: TablesInsert<{ schema: "company_os" }, "lifecycle_transitions"> | TablesInsert<{ schema: "company_os" }, "lifecycle_transitions">[]) => companyOs.from("lifecycle_transitions").insert(row);
export const insertMeetings = (row: TablesInsert<{ schema: "company_os" }, "meetings"> | TablesInsert<{ schema: "company_os" }, "meetings">[]) => companyOs.from("meetings").insert(row);
export const updateMeetings = (patch: TablesUpdate<{ schema: "company_os" }, "meetings">) => companyOs.from("meetings").update(patch);

// The Zoom coaching ingest (entities/coaching/lib/zoom-ingest.ts) writes a
// meeting with its participants and action items, and unwinds all three when a
// child insert fails. PostgREST has no transaction, so the unwind is the
// compensating delete these writers exist for.
export const insertMeetingParticipants = (
  row: TablesInsert<{ schema: "company_os" }, "meeting_participants"> | TablesInsert<{ schema: "company_os" }, "meeting_participants">[],
) => companyOs.from("meeting_participants").insert(row);
export const insertMeetingActionItems = (
  row: TablesInsert<{ schema: "company_os" }, "meeting_action_items"> | TablesInsert<{ schema: "company_os" }, "meeting_action_items">[],
) => companyOs.from("meeting_action_items").insert(row);
export const deleteMeetingParticipants = () => companyOs.from("meeting_participants").delete();
export const deleteMeetingActionItems = () => companyOs.from("meeting_action_items").delete();
export const deleteMeetings = () => companyOs.from("meetings").delete();
