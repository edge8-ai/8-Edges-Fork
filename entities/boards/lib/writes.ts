// The writes other entities may make to boards' tables (multi-entity design §4;
// ME-13, moved off company-os by RS-01). Only the owner writes its tables
// directly; everyone else calls one of these through the entity's index, so the
// table-ownership gate sees no raw cross-entity write. Each writer returns the
// PostgREST builder so the caller keeps its own filters and error handling.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";

export const insertTaskStageLog = (row: TablesInsert<{ schema: "company_os" }, "task_stage_log"> | TablesInsert<{ schema: "company_os" }, "task_stage_log">[]) => companyOs.from("task_stage_log").insert(row);
// A card's birth goes through bearCard (bear-card.ts, A.53), which owes the new
// card its position, status, create row, audit row and events, and a child
// row's through bearSubtasks beside it; an ESLint rail lets only that module
// import this writer.
export const insertTasks = (row: TablesInsert<{ schema: "company_os" }, "tasks"> | TablesInsert<{ schema: "company_os" }, "tasks">[]) => companyOs.from("tasks").insert(row);
export const updateTasks = (patch: TablesUpdate<{ schema: "company_os" }, "tasks">) => companyOs.from("tasks").update(patch);
