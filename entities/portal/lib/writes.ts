// portal's own raw writers, private to the entity since A.70 (ADR 0018): the
// door no longer re-exports this file, and company-os calls a named command
// instead (work-request-records.ts). Each writer returns the PostgREST builder
// so the portal file calling it keeps its own filters, select and error
// handling.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";

export const insertContractorWorkEvents = (row: TablesInsert<{ schema: "company_os" }, "contractor_work_events"> | TablesInsert<{ schema: "company_os" }, "contractor_work_events">[]) => companyOs.from("contractor_work_events").insert(row);
export const updateContractorWorkRequests = (patch: TablesUpdate<{ schema: "company_os" }, "contractor_work_requests">) => companyOs.from("contractor_work_requests").update(patch);
