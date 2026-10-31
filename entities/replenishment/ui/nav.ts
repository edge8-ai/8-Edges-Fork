// What this entity contributes to the Admin shell's navigation (ADR 0002).
// The shell owns the information architecture (kernel/shell/admin-ia.ts) and
// names the Warehouse slot under Operations; this file names the rows in it.
// Each row shows only to someone who may open its page, so a deployment that
// never grants the warehouse roles shows no Warehouse heading at all.
import type { NavContribution } from "@/kernel/shell/nav";

export const adminNav: NavContribution[] = [
  { section: "Four Offices", group: "Operations", subheading: "Warehouse", order: 10, items: [
    { label: "Runs", href: "/admin/operations/replenishment/runs", ico: "☰", enabled: true },
    { label: "Profile", href: "/admin/operations/replenishment/profile", ico: "☑", enabled: true },
  ] },
];
