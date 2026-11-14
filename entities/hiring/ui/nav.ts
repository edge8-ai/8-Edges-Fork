// What this entity contributes to the Admin shell's navigation (ADR 0002).
// The shell owns the information architecture (kernel/shell/admin-ia.ts) and
// names the slots; this file names the rows that belong in them. Drop the entity
// from a deployment and these rows go with it.
import type { NavContribution } from "@/kernel/shell/nav";

// An application sits under its job req, so the ATS has no Applications row:
// the Job Reqs page lists each open role with its candidates.
export const adminNav: NavContribution[] = [
  { section: "Four Offices", group: "Talent", subheading: "ATS", order: 10, items: [
    { label: "Job Reqs", href: "/admin/talent/jobs", ico: "▤", enabled: true },
    { label: "Candidate Pool", href: "/admin/talent/candidate-pool", ico: "↥", enabled: true },
  ] },
];
