// The reads other entities may make of org's tables, for the cases where the
// caller owns the question but not the data. The helper names the table and
// returns the PostgREST builder, so the caller keeps its own columns, filters
// and error handling and the table-ownership gate
// (scripts/check-table-ownership.mjs) sees the read attributed to the owner
// rather than as a raw cross-entity `.from(...)`.
//
// Keep this list short. A caller that needs more than columns and filters wants
// a domain function in this entity, not a builder.
import { companyOs } from "@/kernel/data/supabase";

// PostgREST infers a row shape from a *literal* column list. These helpers take
// a plain `string` so the caller keeps its own columns, which erases that
// inference, and a generic column parameter sends tsc into a combinatorial
// blow-up over PostgREST's conditional types. Naming the result as an open
// record instead keeps every caller's existing `as SomeRow[]` cast working.
type Row = Record<string, unknown>;

// Directory-safe names for a set of team members. The time-off entity's admin
// history screen lists who took leave, which is a time-off question about an
// org fact.
export const selectTeamDirectory = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("team_directory").select<string, Row>(columns, options);
// The company handbook. The team assistant searches it for policy and
// how-we-work questions.
export const selectCompanyInformation = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("company_information").select<string, Row>(columns, options);
export const selectCoreValues = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("core_values").select<string, Row>(columns, options);
export const selectKeyResults = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("key_results").select<string, Row>(columns, options);
export const selectEquipment = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("equipment").select<string, Row>(columns, options);
export const selectSurveys = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("surveys").select<string, Row>(columns, options);
export const selectSurveyFields = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("survey_fields").select<string, Row>(columns, options);
// A key result's check-in trail (K.78): coaching asks whether a company number
// has ever been measured before it prints it under a member's goal.
export const selectKrLogs = (
  columns: string,
  options?: { count?: "exact" | "planned" | "estimated"; head?: boolean },
) => companyOs.from("kr_logs").select<string, Row>(columns, options);
export const selectObjectives = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("objectives").select<string, Row>(columns, options);
export const selectStrategies = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("strategies").select<string, Row>(columns, options);
export const selectSurveyResponses = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("survey_responses").select<string, Row>(columns, options);
export const selectSurveyAnswers = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("survey_answers").select<string, Row>(columns, options);
// The organisation's legal entities. Reimbursements shows the Vietnamese
// entity's legal name and tax code as the buyer a red invoice must name (RB.2);
// they are data here, never code, so a fork carries none of them.
export const selectLegalEntities = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("legal_entities").select<string, Row>(columns, options);
