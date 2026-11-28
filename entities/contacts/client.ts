// The Contacts entity's browser-safe door. Contacts owns no screens yet — its
// admin pages move here in a later slice — so this door carries only what a
// "use client" component elsewhere renders of this entity's data: the staff
// assignment vocabulary and row shapes the two assignment cards in company-os
// take, from a module with no reader in it (lib/staff-assignments-shared.ts).
// scripts/entity-client-doors.test.mjs proves nothing server-only follows.
export {
  ASSIGNMENT_ROLES,
  type AssignmentForCompany,
  type AssignmentForTeamMember,
  type ClientContactOption,
  type CompanyOption,
  type TeamMemberOption,
} from "./lib/staff-assignments-shared";
