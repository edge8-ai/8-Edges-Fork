// What this entity contributes to the team hub's navigation (ADR 0002). The
// shell owns the information architecture (kernel/shell/team-ia.ts) and names
// the slots; this file names the rows that belong in them. A row appears
// only to someone who may open its page (its declared permission, ADR 0013).
import type { NavContribution } from "@/kernel/shell/nav";

export const teamNav: NavContribution[] = [
  { section: null, group: "Company", order: 10, items: [
    { label: "Strategy", href: "/team/strategy", ico: "◆", enabled: true },
    { label: "Company Goals", href: "/team/company-goals", ico: "⊚", enabled: true },
    { label: "Core Values", href: "/team/values", ico: "♥", enabled: true },
    { label: "Org Chart", href: "/team/org", ico: "⌥", enabled: true },
  ] },
];
