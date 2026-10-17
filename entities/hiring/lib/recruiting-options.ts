// Single source of truth for two recruiting vocabularies shown in the applicant
// editor and validated server-side. Keep these in sync with the DB constraints:
// applications.source (applications_source_check) and candidate_profile.pool_status.

// applications.source — how the applicant reached us.
export const APPLICATION_SOURCE_OPTIONS = [
  ["direct", "Direct"],
  ["referral", "Referral"],
  ["job_board", "Job board"],
  ["linkedin", "LinkedIn"],
  ["agency", "Agency"],
  ["sourced", "Sourced"],
  ["career_site", "Career site"],
  ["event", "Event"],
  ["recruiter", "Recruiter"],
  ["other", "Other"],
] as const;

export const APPLICATION_SOURCES = new Set<string>(APPLICATION_SOURCE_OPTIONS.map(([v]) => v));

// candidate_profile.pool_status — where the person sits in the talent pool,
// independent of any single application's status.
export const POOL_STATUS_OPTIONS = [
  ["active", "Active"],
  ["passive", "Passive"],
  ["placed", "Placed"],
  ["do_not_pursue", "Do not pursue"],
] as const;

export const POOL_STATUSES = new Set<string>(POOL_STATUS_OPTIONS.map(([v]) => v));
