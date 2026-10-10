// What this entity contributes to the Admin shell's navigation (ADR 0002).
// The shell owns the information architecture (kernel/shell/admin-ia.ts) and
// names the slots; this file names the rows that belong in them. Drop the entity
// from a deployment and these rows go with it.
import type { NavContribution } from "@/kernel/shell/nav";

export const adminNav: NavContribution[] = [
  { section: "Four Offices", group: "Operations", subheading: "Time Off", order: 10, items: [
    { label: "Requests", href: "/admin/operations/time-off/requests", ico: "☼", enabled: true },
    { label: "Policies", href: "/admin/operations/time-off/policies", ico: "☑", enabled: true },
    { label: "Time Off History", href: "/admin/operations/time-off/history", ico: "☷", enabled: true },
  ] },
];
