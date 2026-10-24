// client-programs' own writes to its tables. Private since A.66: other entities
// call the commands in programs.ts, roadmap-items.ts and client-documents.ts.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";

export const insertClientBacklogItems = (row: TablesInsert<{ schema: "company_os" }, "client_backlog_items"> | TablesInsert<{ schema: "company_os" }, "client_backlog_items">[]) => companyOs.from("client_backlog_items").insert(row);
export const updateClientBacklogItems = (patch: TablesUpdate<{ schema: "company_os" }, "client_backlog_items">) => companyOs.from("client_backlog_items").update(patch);
export const insertClientRoadmapGroups = (row: TablesInsert<{ schema: "company_os" }, "client_roadmap_groups"> | TablesInsert<{ schema: "company_os" }, "client_roadmap_groups">[]) => companyOs.from("client_roadmap_groups").insert(row);
export const updateClientRoadmapGroups = (patch: TablesUpdate<{ schema: "company_os" }, "client_roadmap_groups">) => companyOs.from("client_roadmap_groups").update(patch);
export const upsertClientRoadmapOverview = (
  row: TablesInsert<{ schema: "company_os" }, "client_roadmap_overview"> | TablesInsert<{ schema: "company_os" }, "client_roadmap_overview">[],
  options?: { onConflict?: string; ignoreDuplicates?: boolean },
) => companyOs.from("client_roadmap_overview").upsert(row, options);

