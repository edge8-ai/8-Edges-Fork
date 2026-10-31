// The writes an entity may make to the kernel's messaging log (multi-entity
// design §4; ME-13). `interactions` stays kernel-owned because
// kernel/messaging/email.ts logs every accepted send to it; the CRM
// (company-os) and the site's unsubscribe flow append their own rows through
// this writer instead of writing the table raw, which the table-ownership gate
// (scripts/check-table-ownership.mjs) would fail. Same shape as
// kernel/identity/writes.ts: the verb only, returning the PostgREST builder so
// the caller keeps its select and error handling.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert } from "@/kernel/data/supabase/database.types";

export const insertInteractions = (
  row: TablesInsert<{ schema: "company_os" }, "interactions"> | TablesInsert<{ schema: "company_os" }, "interactions">[],
) => companyOs.from("interactions").insert(row);
