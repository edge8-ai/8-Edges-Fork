// The writes other entities may make to ideas's tables (design §4, ME-13).
// Only the owner writes its tables directly; everyone else calls one of these
// through the entity's index, so the table-ownership gate sees no raw
// cross-entity write. Each writer returns the PostgREST builder so the caller
// keeps its own filters and error handling.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";

export const insertIdeas = (row: TablesInsert<{ schema: "company_os" }, "ideas"> | TablesInsert<{ schema: "company_os" }, "ideas">[]) => companyOs.from("ideas").insert(row);
export const updateIdeas = (patch: TablesUpdate<{ schema: "company_os" }, "ideas">) => companyOs.from("ideas").update(patch);
