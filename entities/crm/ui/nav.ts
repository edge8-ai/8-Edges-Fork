// What this entity contributes to the Admin shell's navigation (ADR 0002).
// The shell owns the information architecture (kernel/shell/admin-ia.ts) and
// names the slots; this file names the rows that belong in them. Drop the entity
// from a deployment and these rows go with it.
import type { NavContribution } from "@/kernel/shell/nav";

export const adminNav: NavContribution[] = [
  { section: "Four Offices", group: "Revenue", subheading: "CRM", order: 10, items: [
    { label: "Cockpit", href: "/admin/revenue", ico: "◎", enabled: true },
    { label: "Deals", href: "/admin/revenue/deals", ico: "$", enabled: true },
    { label: "Leads", href: "/admin/revenue/leads", ico: "◉", enabled: true },
    { label: "Inquiries", href: "/admin/revenue/inquiries", ico: "☰", enabled: true },
    { label: "Companies", href: "/admin/revenue/companies", ico: "▣", enabled: true },
    { label: "Clients", href: "/admin/revenue/clients", ico: "★", enabled: true },
    { label: "Account Health", href: "/admin/revenue/accounts", ico: "♥", enabled: true },
    { label: "Contacts", href: "/admin/contacts", ico: "⚇", enabled: true },
    { label: "Meeting Notes", href: "/admin/revenue/meetings", ico: "☰", enabled: true },
    { label: "Sales Intelligence", href: "/admin/revenue/sales-intelligence", ico: "◭", enabled: true },
  ] },
  { section: "Four Offices", group: "Revenue", subheading: "Commerce", order: 40, items: [
    { label: "Affiliates", href: "/admin/revenue/affiliates", ico: "%", enabled: true },
  ] },
  { section: "Workspace", group: "Settings", subheading: "Configuration", order: 10, items: [
    { label: "Pipelines", href: "/admin/settings/pipelines", ico: "⇶" },
  ] },
];
