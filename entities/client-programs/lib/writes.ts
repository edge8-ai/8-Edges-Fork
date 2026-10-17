// The writes other entities may make to client-programs' tables (design §4).
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";

export const insertAiPrograms = (row: TablesInsert<{ schema: "company_os" }, "ai_programs"> | TablesInsert<{ schema: "company_os" }, "ai_programs">[]) => companyOs.from("ai_programs").insert(row);
export const updateAiPrograms = (patch: TablesUpdate<{ schema: "company_os" }, "ai_programs">) => companyOs.from("ai_programs").update(patch);
export const insertClientBacklogItems = (row: TablesInsert<{ schema: "company_os" }, "client_backlog_items"> | TablesInsert<{ schema: "company_os" }, "client_backlog_items">[]) => companyOs.from("client_backlog_items").insert(row);
export const updateClientBacklogItems = (patch: TablesUpdate<{ schema: "company_os" }, "client_backlog_items">) => companyOs.from("client_backlog_items").update(patch);
export const insertClientRoadmapGroups = (row: TablesInsert<{ schema: "company_os" }, "client_roadmap_groups"> | TablesInsert<{ schema: "company_os" }, "client_roadmap_groups">[]) => companyOs.from("client_roadmap_groups").insert(row);
export const updateClientRoadmapGroups = (patch: TablesUpdate<{ schema: "company_os" }, "client_roadmap_groups">) => companyOs.from("client_roadmap_groups").update(patch);
export const deleteAiPrograms = () => companyOs.from("ai_programs").delete();
export const upsertClientRoadmapOverview = (
  row: TablesInsert<{ schema: "company_os" }, "client_roadmap_overview"> | TablesInsert<{ schema: "company_os" }, "client_roadmap_overview">[],
  options?: { onConflict?: string; ignoreDuplicates?: boolean },
) => companyOs.from("client_roadmap_overview").upsert(row, options);

export const insertProgramDocuments = (row: TablesInsert<{ schema: "company_os" }, "program_documents"> | TablesInsert<{ schema: "company_os" }, "program_documents">[]) => companyOs.from("program_documents").insert(row);
