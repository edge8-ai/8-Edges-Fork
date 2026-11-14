// Contacts' own raw writers (design §4, ME-13). Since A.64 (ADR 0018) they
// are private to this entity: the door no longer re-exports this file, and
// other entities perform the named commands in lib/person-companies.ts,
// lib/staff-assignments.ts, lib/affiliates.ts, lib/people-sensitive.ts,
// lib/brands.ts and lib/tags.ts, which call these.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";

export const upsertPeopleSensitiveRow = (
  row: TablesInsert<{ schema: "company_os" }, "people_sensitive"> | TablesInsert<{ schema: "company_os" }, "people_sensitive">[],
  options?: { onConflict?: string; ignoreDuplicates?: boolean },
) => companyOs.from("people_sensitive").upsert(row, options);
export const insertStaffAssignments = (row: TablesInsert<{ schema: "company_os" }, "staff_assignments"> | TablesInsert<{ schema: "company_os" }, "staff_assignments">[]) => companyOs.from("staff_assignments").insert(row);
export const updateStaffAssignments = (patch: TablesUpdate<{ schema: "company_os" }, "staff_assignments">) => companyOs.from("staff_assignments").update(patch);
export const insertAffiliates = (row: TablesInsert<{ schema: "company_os" }, "affiliates"> | TablesInsert<{ schema: "company_os" }, "affiliates">[]) => companyOs.from("affiliates").insert(row);
export const updateAffiliates = (patch: TablesUpdate<{ schema: "company_os" }, "affiliates">) => companyOs.from("affiliates").update(patch);
export const upsertBrandProfiles = (
  row: TablesInsert<{ schema: "company_os" }, "brand_profiles"> | TablesInsert<{ schema: "company_os" }, "brand_profiles">[],
  options?: { onConflict?: string; ignoreDuplicates?: boolean },
) => companyOs.from("brand_profiles").upsert(row, options);
export const insertPersonCompanies = (row: TablesInsert<{ schema: "company_os" }, "person_companies"> | TablesInsert<{ schema: "company_os" }, "person_companies">[]) => companyOs.from("person_companies").insert(row);
// A link that may already exist (Z.11's inquiry chain retries its step), so the
// unique (person_id, company_id) answers a second write with nothing.
export const upsertPersonCompanies = (row: TablesInsert<{ schema: "company_os" }, "person_companies">) =>
  companyOs.from("person_companies").upsert(row, { onConflict: "person_id,company_id", ignoreDuplicates: true });
export const updatePersonCompanies = (patch: TablesUpdate<{ schema: "company_os" }, "person_companies">) => companyOs.from("person_companies").update(patch);
export const upsertTags = (
  row: TablesInsert<{ schema: "company_os" }, "tags">,
  options?: { onConflict?: string; ignoreDuplicates?: boolean },
) => companyOs.from("tags").upsert(row, options);
export const upsertTaggables = (
  row: TablesInsert<{ schema: "company_os" }, "taggables">,
  options?: { onConflict?: string; ignoreDuplicates?: boolean },
) => companyOs.from("taggables").upsert(row, options);
export const deleteTaggables = () => companyOs.from("taggables").delete();

