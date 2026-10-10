// The browser-safe half of staff assignments: the role vocabulary and the row
// shapes, with no reader beside them. lib/staff-assignments.ts imports the
// service-role client for its reads, so a "use client" component that took
// ASSIGNMENT_ROLES from there — or from the entity's server barrel, which
// re-exports it — pulled the whole data layer into the browser bundle. The two
// assignment cards in company-os import from this entity's client door instead,
// and the server module re-exports everything here so nothing else moves.

// Client-visible role titles offered in the assign dropdown. Curated so the
// label a client sees on their team is consistent; edit this list to change it.
export const ASSIGNMENT_ROLES = [
  "AI Officer",
  "AI Engineer",
  "Database Specialist",
  "Solutions Architect",
  "Project Lead",
  "Account Manager",
  "Designer",
  "QA Specialist",
] as const;

export type AssignmentForCompany = {
  id: string;
  team_member_id: string;
  role_title: string | null;
  // Person at the client who approves this placement's leave (null = the
  // Edge8 manager keeps it). See lib/time-off/approver.ts.
  client_manager_person_id: string | null;
  client_manager_name: string | null;
  client_visible: boolean;
  start_date: string | null;
  end_date: string | null;
  status: string;
  // The staff member's name columns, so callers name them with personName()
  // (S.16.12) rather than full_name alone.
  display_name: string | null;
  preferred_name: string | null;
  full_name: string | null;
  email: string | null;
  position_title: string | null;
};

export type AssignmentForTeamMember = {
  id: string;
  company_id: string;
  company_name: string | null;
  role_title: string | null;
  client_manager_person_id: string | null;
  client_manager_name: string | null;
  client_visible: boolean;
  start_date: string | null;
  end_date: string | null;
  status: string;
};

export type CompanyOption = { id: string; name: string | null };
export type TeamMemberOption = { id: string; name: string };
export type ClientContactOption = { id: string; name: string };
