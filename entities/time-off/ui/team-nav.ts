// What this entity contributes to the team hub's navigation (ADR 0002). The
// shell owns the information architecture (kernel/shell/team-ia.ts) and names
// the slots; this file names the rows that belong in them. The row sits here
// rather than in team because this entity owns /team/time-off (routes/team/):
// a deployment that leaves time-off out must lose the link with the page.
import type { NavContribution } from "@/kernel/shell/nav";

export const teamNav: NavContribution[] = [
  { section: null, group: "My Work", order: 20, items: [
    { label: "Time Off", href: "/team/time-off", ico: "☼", enabled: true },
  ] },
];
