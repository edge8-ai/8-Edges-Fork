// What this entity contributes to the Admin shell's navigation (ADR 0002).
// The shell owns the information architecture (kernel/shell/admin-ia.ts) and
// names the slots; this file names the rows that belong in them. Drop the entity
// from a deployment and these rows go with it.
import type { NavContribution } from "@/kernel/shell/nav";

export const adminNav: NavContribution[] = [
  { section: "Four Offices", group: "Operations", subheading: "Workplace", order: 30, items: [
    { label: "Documents", href: "/admin/operations/documents", ico: "⎙" },
  ] },
];
