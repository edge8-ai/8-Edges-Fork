// crm's own thin table writers. Private to the entity since A.63: another
// entity writes crm's tables through a named command in the concept files
// (meeting-records.ts, inquiries.ts, ...), never through these.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";

export const updateDeals = (patch: TablesUpdate<{ schema: "company_os" }, "deals">) => companyOs.from("deals").update(patch);
export const deleteDeals = () => companyOs.from("deals").delete();
export const updateInquiries = (patch: TablesUpdate<{ schema: "company_os" }, "inquiries">) => companyOs.from("inquiries").update(patch);
export const upsertLead = (
  row: TablesInsert<{ schema: "company_os" }, "lead"> | TablesInsert<{ schema: "company_os" }, "lead">[],
  options?: { onConflict?: string; ignoreDuplicates?: boolean },
) => companyOs.from("lead").upsert(row, options);
export const insertLifecycleTransitions = (row: TablesInsert<{ schema: "company_os" }, "lifecycle_transitions"> | TablesInsert<{ schema: "company_os" }, "lifecycle_transitions">[]) => companyOs.from("lifecycle_transitions").insert(row);
