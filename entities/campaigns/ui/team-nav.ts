// What this entity contributes to the team hub's navigation (ADR 0002). The
// shell owns the information architecture (kernel/shell/team-ia.ts) and names
// the slots; this file names the rows that belong in them. Marketing appears
// only to members holding the `revenue` permission.
import type { NavContribution } from "@/kernel/shell/nav";

export const teamNav: NavContribution[] = [
  { section: null, group: "Revenue", subheading: "Marketing", order: 10, items: [
    { label: "Overview", href: "/team/revenue/marketing", ico: "◑", icon: "pie", enabled: true },
    { label: "Campaigns", href: "/team/revenue/marketing/campaigns", ico: "◎", icon: "megaphone", enabled: true },
    { label: "Broadcasts", href: "/team/revenue/marketing/broadcasts", ico: "✉", icon: "send", enabled: true },
    { label: "Brands", href: "/team/revenue/marketing/brands", ico: "◈", icon: "tag", enabled: true },
    { label: "Books", href: "/team/revenue/marketing/books", ico: "❒", icon: "book", enabled: true },
  ] },
];
