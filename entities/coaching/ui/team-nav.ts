// What this entity contributes to the team hub's navigation (ADR 0002). The
// shell owns the information architecture (kernel/shell/team-ia.ts) and names
// the slots; this file names the rows that belong in them. A row appears
// only to someone who may open its page (its declared permission, ADR 0013).
import type { NavContribution } from "@/kernel/shell/nav";

export const teamNav: NavContribution[] = [
  { section: null, group: "Me", order: 10, items: [
    { label: "My Coach", href: "/team/my-coaching", ico: "◎", enabled: true },
  ] },
  { section: null, group: "My Team", order: 10, items: [
    { label: "Coaching", href: "/team/coaching", ico: "◎", enabled: true },
  ] },
  { section: null, group: "Company", order: 30, items: [
    { label: "AIO Group Coaching", href: "/team/coaching-sessions", ico: "☰", enabled: true },
  ] },
];
