// The writes other entities may make to retreats's tables (multi-entity
// design §4; ME-13). Only the owner writes its tables directly; everyone else
// calls one of these through the entity's index, so the table-ownership gate
// (scripts/check-table-ownership.mjs) sees no raw cross-entity write. Each
// writer is the verb of the statement its caller used to build inline — it
// returns the PostgREST builder so the caller keeps its own filters, select
// and error handling, and moving the call here changed no behaviour. A
// caller that needs more than a filter belongs in this entity as a function.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";

export const insertEventRegistrations = (row: TablesInsert<{ schema: "company_os" }, "event_registrations"> | TablesInsert<{ schema: "company_os" }, "event_registrations">[]) => companyOs.from("event_registrations").insert(row);
export const updateEventRegistrations = (patch: TablesUpdate<{ schema: "company_os" }, "event_registrations">) => companyOs.from("event_registrations").update(patch);
// A claim's Trip is an events row (reimbursements design §1.1, RB.11): the
// claim form adds one as a draft, internal event, and retreats owns the table.
export const insertEvents = (row: TablesInsert<{ schema: "company_os" }, "events">) => companyOs.from("events").insert(row);
