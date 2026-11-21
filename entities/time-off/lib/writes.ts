// time-off's own raw writers, private to the entity since A.70 (ADR 0018):
// the door no longer re-exports this file. Another entity writes time_off only
// through a command the door exports (leave-filing.ts) or through the one step
// in leave-transition.ts. Each writer returns the PostgREST builder so the
// time-off file calling it keeps its own filters, select and error handling.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";

export const insertTimeOff = (row: TablesInsert<{ schema: "company_os" }, "time_off"> | TablesInsert<{ schema: "company_os" }, "time_off">[]) => companyOs.from("time_off").insert(row);
export const updateTimeOff = (patch: TablesUpdate<{ schema: "company_os" }, "time_off">) => companyOs.from("time_off").update(patch);
export const updateLeavePolicies = (patch: TablesUpdate<{ schema: "company_os" }, "leave_policies">) => companyOs.from("leave_policies").update(patch);
