// What this entity contributes to the Admin shell's navigation (ADR 0002).
// The shell owns the information architecture (kernel/shell/admin-ia.ts) and
// names the slots; this file names the rows that belong in them. Drop the entity
// from a deployment and these rows go with it.
import type { NavContribution } from "@/kernel/shell/nav";

export const adminNav: NavContribution[] = [
  { section: "Operating System", group: "Edges", order: 40, items: [
    { label: "Sync", href: "/admin/edges/sync", ico: "☰", enabled: true },
    { label: "Issues", href: "/admin/edges/issues", ico: "◉", enabled: true },
  ] },
  { section: "Four Offices", group: "Innovation", order: 10, items: [
    { label: "Cockpit", href: "/admin/innovation", ico: "◎", enabled: true },
  ] },
  { section: "Four Offices", group: "Innovation", subheading: "Ideas", order: 10, items: [
    { label: "Idea backlog", href: "/admin/innovation/ideas", ico: "✦", enabled: true },
  ] },
];
