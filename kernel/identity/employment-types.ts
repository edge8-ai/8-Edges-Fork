// The values team_members.employment_type takes, with the words an admin reads
// them in. full_time, part_time and intern make a person a Team member; contract
// makes them a Contractor (the baseline roles in kernel/identity/access.ts); the
// other two imply neither. Client-safe: no imports, so a form may read it.
export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "intern", "temp", "advisor"] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contractor",
  intern: "Intern",
  temp: "Temp",
  advisor: "Advisor",
};
