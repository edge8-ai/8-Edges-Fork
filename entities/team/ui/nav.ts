// What this entity contributes to the Admin shell's navigation (ADR 0002).
// The shell owns the information architecture (kernel/shell/admin-ia.ts) and
// names the slots; this file names the rows that belong in them. Drop the entity
// from a deployment and these rows go with it.
import type { NavContribution } from "@/kernel/shell/nav";

export const adminNav: NavContribution[] = [
  // The same two documents the team hub shows under Company (team-nav.ts),
  // after the org entity's rows (order 10) so they sit under Onboarding Deck.
  { section: "Operating System", group: "Company", order: 20, items: [
    { label: "Handbook", href: "/admin/company/handbook", ico: "▤", enabled: true },
    { label: "Health Insurance", href: "/admin/company/insurance", ico: "♥", enabled: true },
  ] },
  { section: "Four Offices", group: "Talent", subheading: "People", order: 40, items: [
    { label: "Reviews", href: "/admin/talent/reviews", ico: "✓", enabled: true },
  ] },
];
