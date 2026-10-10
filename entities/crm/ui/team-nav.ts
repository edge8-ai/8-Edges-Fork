// What this entity contributes to the team hub's navigation (ADR 0002). The
// shell owns the information architecture (kernel/shell/team-ia.ts) and names
// the slots; this file names the rows that belong in them. A row appears
// only to someone who may open its page (its declared permission, ADR 0013). The Revenue rows
// mirror the admin CRM rows, less Contacts, which is not part of Revenue.
import type { NavContribution } from "@/kernel/shell/nav";

export const teamNav: NavContribution[] = [
  { section: null, group: "My Work", order: 15, items: [
    { label: "Clients", href: "/team/clients", ico: "◔", enabled: true },
  ] },
  { section: null, group: "Revenue", subheading: "CRM", order: 10, items: [
    { label: "Cockpit", href: "/team/revenue", ico: "◎", enabled: true },
    { label: "Deals", href: "/team/revenue/deals", ico: "$", enabled: true },
    { label: "Leads", href: "/team/revenue/leads", ico: "◉", enabled: true },
    { label: "Inquiries", href: "/team/revenue/inquiries", ico: "☰", enabled: true },
    { label: "Companies", href: "/team/revenue/companies", ico: "▣", enabled: true },
    { label: "Clients", href: "/team/revenue/clients", ico: "★", enabled: true },
    { label: "Account Health", href: "/team/revenue/accounts", ico: "♥", enabled: true },
    { label: "Meeting Notes", href: "/team/revenue/meetings", ico: "☰", enabled: true },
    { label: "Sales Intelligence", href: "/team/revenue/sales-intelligence", ico: "◭", enabled: true },
  ] },
  { section: null, group: "Revenue", subheading: "Commerce", order: 40, items: [
    { label: "Affiliates", href: "/team/revenue/affiliates", ico: "%", enabled: true },
  ] },
];
