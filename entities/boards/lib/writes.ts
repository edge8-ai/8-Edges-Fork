// boards' own raw writers (multi-entity design §4; ME-13, moved off company-os
// by RS-01), private to the entity since A.68 (ADR 0018): the door no longer
// re-exports this file, and another entity performs a named command instead
// (bearCard, landCardAsSystem, editSyncedCard). Each writer returns the
// PostgREST builder so the boards file calling it keeps its own filters and
// error handling.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";

export const insertTaskStageLog = (row: TablesInsert<{ schema: "company_os" }, "task_stage_log"> | TablesInsert<{ schema: "company_os" }, "task_stage_log">[]) => companyOs.from("task_stage_log").insert(row);
// A card's birth goes through bearCard (bear-card.ts, A.53), which owes the new
// card its position, status, create row, audit row and events, and a child
// row's through bearSubtasks beside it; an ESLint rail lets only that module
// import this writer.
export const insertTasks = (row: TablesInsert<{ schema: "company_os" }, "tasks"> | TablesInsert<{ schema: "company_os" }, "tasks">[]) => companyOs.from("tasks").insert(row);
export const updateTasks = (patch: TablesUpdate<{ schema: "company_os" }, "tasks">) => companyOs.from("tasks").update(patch);
