// Row shapes for two company_os reads that a higher-layer entity loads but a
// company-os component renders: the org chart (team_members) and open
// headcount (job_requisitions). The third, both sides of a client account,
// moved to entities/contacts with the staff-assignments reader (RS-04). The loaders live where the gate lives — /team's are in
// entities/team, the admin's companyId-scoped mirror is in
// entities/crm/lib/company-hub.ts — but the shape belongs to
// company-os, which owns the tables.
//
// They live here because the layer order runs company-os (2) below team (5): a
// file in company-os's door graph may not import team's door, not even for a
// type, or the first value that follows the type is a cycle. team re-exports
// all three from its own door, so its importers are unchanged.

// The org chart: names, roles, departments, city and photo (no contact
// details), plus manager_id and employment_type so a page can assemble the
// reporting tree and label contractors. `name` is the name people go by;
// `legalName` is the name on record, which the directory shows, so the chart's
// panel can show both and the two screens can be matched.
export type OrgEntry = {
  id: string;
  personId: string;
  name: string;
  legalName: string | null;
  avatarUrl: string | null;
  positionTitle: string | null;
  departmentName: string | null;
  location: string | null;
  employmentType: string | null;
  managerId: string | null;
};

// Open headcount, keyed by the hiring manager who owns it. job_requisitions
// stores hiring_manager_id against people, not team_members, so callers that
// work in team_member ids (the org chart) match on OrgEntry.personId. Company
// visible: title, location and the public posting link only — never salary
// bands or candidate data.
export type OpenRole = {
  id: string;
  title: string;
  slug: string | null;
  location: string | null;
  employmentType: string | null;
  isPublic: boolean;
  hiringManagerPersonId: string | null;
};
