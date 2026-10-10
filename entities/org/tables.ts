// The Supabase tables the org entity owns (design §4; RS-09).
//
// Org is Edge8's own shape: who works here (team_directory and the
// current_team_members view), how they are organised (departments, positions),
// what the company is aiming at (objectives, key_results, kr_logs, strategies,
// core_values), what it is on paper (company_information, company_profile,
// legal_entities, service_lines), what each person is qualified for
// (person_qualifications), the kit they hold (equipment and its assignments and
// requests), the survey engine end to end (surveys, survey_fields and the
// responses and answers the portal runner writes through its writers, and the
// capability_pulse_responses and capability_pulse_sessions views over them) and the
// capacity model (capacity_roles and the capacity_commitments against them:
// roles and hours, never people).
//
// Ownership means this entity is the only one that writes them directly;
// scripts/check-table-ownership.mjs ratchets everyone else's reads and fails an
// unlisted cross-entity write. The names here and the `tables` array for org in
// entities.manifest.json are the same list.
export const ORG_TABLES = [
  "capability_pulse_responses",
  "capability_pulse_sessions",
  "capacity_commitments",
  "capacity_roles",
  "company_information",
  "company_profile",
  "core_values",
  "current_team_members",
  "departments",
  "equipment",
  "equipment_assignments",
  "equipment_requests",
  "key_results",
  "kr_logs",
  "legal_entities",
  "objectives",
  "person_qualifications",
  "positions",
  "service_lines",
  "strategies",
  "survey_answers",
  "survey_assignments",
  "survey_fields",
  "survey_responses",
  "surveys",
  "team_directory",
] as const;
