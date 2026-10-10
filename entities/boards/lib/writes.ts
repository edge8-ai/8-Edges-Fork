// The writes other entities may make to boards' tables (multi-entity design §4;
// ME-13, moved off company-os by RS-01). Only the owner writes its tables
// directly; everyone else calls one of these through the entity's index, so the
// table-ownership gate sees no raw cross-entity write. Each writer returns the
// PostgREST builder so the caller keeps its own filters and error handling.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";

export const insertTaskStageLog = (row: TablesInsert<{ schema: "company_os" }, "task_stage_log">) => companyOs.from("task_stage_log").insert(row);
export const insertTasks = (row: TablesInsert<{ schema: "company_os" }, "tasks"> | TablesInsert<{ schema: "company_os" }, "tasks">[]) => companyOs.from("tasks").insert(row);
export const updateTasks = (patch: TablesUpdate<{ schema: "company_os" }, "tasks">) => companyOs.from("tasks").update(patch);
