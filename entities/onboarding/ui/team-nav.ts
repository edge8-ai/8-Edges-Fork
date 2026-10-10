// What this entity contributes to the team hub's navigation (ADR 0002). The
// shell owns the information architecture (kernel/shell/team-ia.ts) and names
// the slots; this file names the rows that belong in them. A row appears
// only to someone who may open its page (its declared permission, ADR 0013).
import type { NavContribution } from "@/kernel/shell/nav";

export const teamNav: NavContribution[] = [
  { section: null, group: "My Team", order: 25, items: [
    { label: "Onboarding", href: "/team/onboarding", ico: "◐", enabled: true },
  ] },
];
