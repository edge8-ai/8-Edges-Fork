// What this entity contributes to the team hub's navigation (ADR 0002). The
// shell owns the information architecture (kernel/shell/team-ia.ts) and names
// the slots; this file names the rows that belong in them. The Revenue rows
// appear only to members holding the `revenue` permission; the pages behind
// them are the admin ones, served again under /team/revenue.
import type { NavContribution } from "@/kernel/shell/nav";

export const teamNav: NavContribution[] = [
  { section: null, group: "Revenue", subheading: "Commerce", order: 10, items: [
    { label: "Orders", href: "/team/revenue/orders", ico: "⛁", enabled: true },
    { label: "Invoices", href: "/team/revenue/invoices", ico: "¤", enabled: true },
    { label: "AIO Pad", href: "/team/revenue/aio-pad", ico: "⌂", enabled: true },
  ] },
  { section: null, group: "Revenue", subheading: "Commerce", order: 30, items: [
    { label: "Products", href: "/team/revenue/products", ico: "▦", enabled: true },
  ] },
];
