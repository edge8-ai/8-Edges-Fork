// The writes other entities may make to portal's tables (multi-entity
// design §4; ME-13). Only the owner writes its tables directly; everyone else
// calls one of these through the entity's index, so the table-ownership gate
// (scripts/check-table-ownership.mjs) sees no raw cross-entity write. Each
// writer is the verb of the statement its caller used to build inline — it
// returns the PostgREST builder so the caller keeps its own filters, select
// and error handling, and moving the call here changed no behaviour. A
// caller that needs more than a filter belongs in this entity as a function.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";

export const insertContractorWorkEvents = (row: TablesInsert<{ schema: "company_os" }, "contractor_work_events"> | TablesInsert<{ schema: "company_os" }, "contractor_work_events">[]) => companyOs.from("contractor_work_events").insert(row);
export const insertContractorWorkRequests = (row: TablesInsert<{ schema: "company_os" }, "contractor_work_requests"> | TablesInsert<{ schema: "company_os" }, "contractor_work_requests">[]) => companyOs.from("contractor_work_requests").insert(row);
export const updateContractorWorkRequests = (patch: TablesUpdate<{ schema: "company_os" }, "contractor_work_requests">) => companyOs.from("contractor_work_requests").update(patch);
