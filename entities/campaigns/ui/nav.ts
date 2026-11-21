// What this entity contributes to the Admin shell's navigation (ADR 0002).
// The shell owns the information architecture (kernel/shell/admin-ia.ts) and
// names the slots; this file names the rows that belong in them. Drop the entity
// from a deployment and these rows go with it.
import type { NavContribution } from "@/kernel/shell/nav";

export const adminNav: NavContribution[] = [
  { section: "Four Offices", group: "Revenue", subheading: "Marketing", order: 10, items: [
    { label: "Overview", href: "/admin/revenue/marketing", ico: "◑", enabled: true },
    { label: "Schedule", href: "/admin/revenue/marketing/schedule", ico: "▦", enabled: true },
    { label: "Campaigns", href: "/admin/revenue/marketing/campaigns", ico: "◎", enabled: true },
    { label: "Broadcasts", href: "/admin/revenue/marketing/broadcasts", ico: "✉", enabled: true },
    { label: "Recurring", href: "/admin/revenue/marketing/recurring", ico: "↻", enabled: true },
    { label: "Audiences", href: "/admin/revenue/marketing/audiences", ico: "◍", enabled: true },
    { label: "Brands", href: "/admin/revenue/marketing/brands", ico: "◈", enabled: true },
    { label: "Books", href: "/admin/revenue/marketing/books", ico: "❒", enabled: true },
  ] },
];
