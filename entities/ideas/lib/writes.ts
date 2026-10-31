// ideas' own raw writers, private to the entity since A.70 (ADR 0018): the
// door no longer re-exports this file, and another entity calls a named
// command instead (idea-edits.ts, postSpark). Each writer returns the
// PostgREST builder so the ideas file calling it keeps its own filters and
// error handling.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert } from "@/kernel/data/supabase/database.types";

export const insertIdeas = (row: TablesInsert<{ schema: "company_os" }, "ideas"> | TablesInsert<{ schema: "company_os" }, "ideas">[]) => companyOs.from("ideas").insert(row);
