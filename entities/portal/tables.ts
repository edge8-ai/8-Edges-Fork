// The Supabase tables and views the portal entity owns (multi-entity design §4,
// and the `tables` array for `portal` in entities.manifest.json, which is what
// scripts/check-table-ownership.mjs actually reads).
//
// Three groups: the survey engine (definitions, fields and the answers a
// respondent submits), the contractor work requests the portal originates and
// decides, and the client roadmap and program documents the portal shares with
// the admin and team client screens. Only the owner writes a table directly;
// the admin-side writes that remain are in scripts/table-ownership-allowlist.json
// with a reason until those screens reach the portal through its index.
export const PORTAL_TABLES = [
  "contractor_work_events",
  "contractor_work_requests",
  "program_plans",
  "survey_list",
] as const;
