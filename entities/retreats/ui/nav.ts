// What this entity contributes to the Admin shell's navigation (ADR 0002).
// The shell owns the information architecture (kernel/shell/admin-ia.ts) and
// names the slots; this file names the rows that belong in them. Drop the entity
// from a deployment and these rows go with it.
import type { NavContribution } from "@/kernel/shell/nav";

export const adminNav: NavContribution[] = [
  { section: "Four Offices", group: "Revenue", subheading: "Commerce", order: 20, items: [
    { label: "Events", href: "/admin/revenue/events", ico: "✓", enabled: true },
  ] },
  { section: "Four Offices", group: "Operations", subheading: "Retreats", order: 10, items: [
    { label: "Retreats P&L", href: "/admin/operations/retreats", ico: "◇", enabled: true },
  ] },
];
