// What this entity contributes to the Admin shell's navigation (ADR 0002).
// Empty on purpose (2026-11-06): the module was never fully built and Edge8
// does not use it, so no Warehouse heading shows under Operations yet. The
// slot stays named in kernel/shell/admin-ia.ts and the routes stay mounted.
// To show it again, restore the group:
//   { section: "Four Offices", group: "Operations", subheading: "Warehouse", order: 10, items: [
//     { label: "Runs", href: "/admin/operations/replenishment/runs", ico: "☰", enabled: true },
//     { label: "Profile", href: "/admin/operations/replenishment/profile", ico: "☑", enabled: true },
//   ] },
import type { NavContribution } from "@/kernel/shell/nav";

export const adminNav: NavContribution[] = [];
