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

// job_requisitions.employment_type, and the words a person reads for it. The
// team Hiring page printed the stored value ("full_time") until TH.18; every
// screen that shows or validates a type reads this one list.
export const EMPLOYMENT_TYPE_OPTIONS = [
  ["full_time", "Full-time"],
  ["part_time", "Part-time"],
  ["contract", "Contract"],
  ["intern", "Internship"],
  ["temp", "Temporary"],
  ["advisor", "Advisor"],
] as const;

export const EMPLOYMENT_TYPES = new Set<string>(EMPLOYMENT_TYPE_OPTIONS.map(([v]) => v));

const EMPLOYMENT_TYPE_LABEL = new Map<string, string>(EMPLOYMENT_TYPE_OPTIONS);

/** "Full-time" for "full_time"; null for no type; an unknown stored value is shown as itself. */
export function employmentTypeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return EMPLOYMENT_TYPE_LABEL.get(value) ?? value;
}
