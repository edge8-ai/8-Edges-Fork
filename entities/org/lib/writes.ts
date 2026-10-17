// The writes other entities may make to org's tables (design §4). Only the
// owner writes its tables directly; everyone else calls one of these through
// the entity's index, so the table-ownership gate sees no raw cross-entity
// write. Each writer is the verb of the statement its caller used to build
// inline — it returns the PostgREST builder so the caller keeps its own
// filters, select and error handling.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";

// A team member asking for a laptop from the /team workspace.
export const insertEquipmentRequests = (row: TablesInsert<{ schema: "company_os" }, "equipment_requests">) => companyOs.from("equipment_requests").insert(row);
// The SDR qualification form on a lead, filed against the person.
export const upsertPersonQualifications = (
  row: TablesInsert<{ schema: "company_os" }, "person_qualifications">,
  options: { onConflict: string },
) => companyOs.from("person_qualifications").upsert(row, options);
// The public survey runner in portal writes a response and its answers; org
// owns the survey engine end to end, so the writes come through here.
export const insertSurveyResponses = (row: TablesInsert<{ schema: "company_os" }, "survey_responses">) => companyOs.from("survey_responses").insert(row);
export const insertSurveyAnswers = (rows: TablesInsert<{ schema: "company_os" }, "survey_answers">[]) => companyOs.from("survey_answers").insert(rows);
export const deleteSurveyResponses = () => companyOs.from("survey_responses").delete();
// Settings → Legal entities: the company's own fields and its registration
// details change through the update, compare-and-set by the caller's filters,
// and a Super Admin adds a new entity with the insert.
export const updateLegalEntities = (patch: TablesUpdate<{ schema: "company_os" }, "legal_entities">) => companyOs.from("legal_entities").update(patch);
export const insertLegalEntities = (row: TablesInsert<{ schema: "company_os" }, "legal_entities">) => companyOs.from("legal_entities").insert(row);
