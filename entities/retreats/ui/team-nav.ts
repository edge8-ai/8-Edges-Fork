// What this entity contributes to the team hub's navigation (ADR 0002). The
// shell owns the information architecture (kernel/shell/team-ia.ts) and names
// the slots; this file names the rows that belong in them. Events appears only
// to members holding the `revenue` permission.
import type { NavContribution } from "@/kernel/shell/nav";

export const teamNav: NavContribution[] = [
  { section: null, group: "Revenue", subheading: "Commerce", order: 20, items: [
    { label: "Events", href: "/team/revenue/events", ico: "✓", enabled: true },
  ] },
];
