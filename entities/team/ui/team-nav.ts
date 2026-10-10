// What this entity contributes to the team hub's navigation (ADR 0002). The
// shell owns the information architecture (kernel/shell/team-ia.ts) and names
// the slots; this file names the rows that belong in them. A row appears
// only to someone who may open its page (its declared permission, ADR 0013).
import type { NavContribution } from "@/kernel/shell/nav";

export const teamNav: NavContribution[] = [
  { section: null, group: null, order: 10, items: [
    { label: "Home", href: "/team", ico: "◈", enabled: true },
  ] },
  // The approvals inbox (Z.2.1) is each person's own list of what waits on
  // them or a role they hold, and every team login may open it, so it sits
  // under Me beside the notifications Inbox rather than under My Team, which
  // only managers, coaches and requisition owners see.
  { section: null, group: "Me", order: 6, items: [
    { label: "Approvals", href: "/team/approvals", ico: "✓", enabled: true },
  ] },
  { section: null, group: "Me", order: 30, items: [
    { label: "Reviews", href: "/team/reviews", ico: "★", enabled: true },
  ] },
  { section: null, group: "Me", order: 50, items: [
    { label: "Profile", href: "/team/profile", ico: "☺", enabled: true },
    { label: "My Equipment", href: "/team/equipment", ico: "▤", enabled: true },
  ] },
  { section: null, group: "Company", order: 20, items: [
    { label: "Directory", href: "/team/directory", ico: "☷", enabled: true },
    { label: "Gallery", href: "/team/gallery", ico: "▦", enabled: true },
    { label: "Kudos", href: "/team/kudos", ico: "♡", enabled: true },
  ] },
  { section: null, group: "Company", order: 40, items: [
    { label: "Onboarding Deck", href: "/team/onboarding-deck", ico: "▷", enabled: true },
  ] },
  // The two documents every member is asked about most. Both frame a page from
  // the private library (lib/company-docs.ts), which a signed-in member opens
  // without the access code; a fork with no library gets a "not yet" page.
  { section: null, group: "Company", order: 45, items: [
    { label: "Handbook", href: "/team/handbook", ico: "▤", enabled: true },
    { label: "Health Insurance", href: "/team/insurance", ico: "♥", enabled: true },
  ] },
  // Every member browses and adds vendors (team.vendors); bank
  // details and tax IDs stay on the admin page.
  { section: null, group: "Company", order: 50, items: [
    { label: "Vendors", href: "/team/vendors", ico: "⛟", enabled: true },
  ] },
];
