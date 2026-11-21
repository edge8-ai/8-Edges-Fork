// The SDR qualification a lead is filed with (person_qualifications), A.67.
// One row per person: saving again replaces the answers. Until A.67 crm called
// the raw `upsertPersonQualifications(row, { onConflict })` and named the
// conflict column itself.
import type { TablesInsert } from "@/kernel/data/supabase/database.types";
import { upsertPersonQualifications } from "./writes";

/** Save a person's qualification answers, replacing any saved before. */
export async function savePersonQualification(row: TablesInsert<{ schema: "company_os" }, "person_qualifications">) {
  return upsertPersonQualifications(row, { onConflict: "person_id" });
}
