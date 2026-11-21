// What this entity contributes to the Admin shell's navigation (ADR 0002). The
// shell owns the information architecture (kernel/shell/admin-ia.ts) and names
// the slots; this file names the rows that belong in them. The three rows moved
// here from company-os with the screens (ADR 0025) and keep their place.
import type { NavContribution } from "@/kernel/shell/nav";

export const adminNav: NavContribution[] = [
  { section: "Four Offices", group: "Operations", subheading: "Contractors", order: 10, items: [
    { label: "Work Requests", href: "/admin/operations/contractor-requests", ico: "✎", enabled: true },
    { label: "Contractors", href: "/admin/operations/contractors", ico: "⚒", enabled: true },
    { label: "Payments", href: "/admin/operations/contractor-payments", ico: "$", enabled: true },
  ] },
];
