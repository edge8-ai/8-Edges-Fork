// What this entity contributes to the team hub's navigation (ADR 0002). The
// shell owns the information architecture (kernel/shell/team-ia.ts) and names
// the slots; this file names the rows that belong in them. A row appears
// only to someone who may open its page (its declared permission, ADR 0013).
import type { NavContribution } from "@/kernel/shell/nav";

export const teamNav: NavContribution[] = [
  { section: null, group: null, order: 10, items: [
    { label: "Home", href: "/team", ico: "◈", icon: "home", enabled: true },
  ] },
  { section: null, group: "Me", order: 30, items: [
    { label: "Reviews", href: "/team/reviews", ico: "★", icon: "clipboard", enabled: true },
  ] },
  { section: null, group: "Me", order: 50, items: [
    { label: "Profile", href: "/team/profile", ico: "☺", icon: "profile", enabled: true },
    { label: "My Equipment", href: "/team/equipment", ico: "▤", icon: "laptop", enabled: true },
  ] },
  { section: null, group: "Company", order: 20, items: [
    { label: "Directory", href: "/team/directory", ico: "☷", icon: "directory", enabled: true },
    { label: "Gallery", href: "/team/gallery", ico: "▦", icon: "image", enabled: true },
    { label: "Kudos", href: "/team/kudos", ico: "♡", icon: "award", enabled: true },
  ] },
  { section: null, group: "Company", order: 40, items: [
    { label: "Onboarding Deck", href: "/team/onboarding-deck", ico: "▷", icon: "slides", enabled: true },
  ] },
  // The two documents every member is asked about most. Both frame a page from
  // the private library (lib/company-docs.ts), which a signed-in member opens
  // without the access code; a fork with no library gets a "not yet" page.
  { section: null, group: "Company", order: 45, items: [
    { label: "Handbook", href: "/team/handbook", ico: "▤", icon: "bookOpen", enabled: true },
    { label: "Health Insurance", href: "/team/insurance", ico: "♥", icon: "shield", enabled: true },
  ] },
  // Every member browses and adds vendors (team.vendors); bank
  // details and tax IDs stay on the admin page.
  { section: null, group: "Company", order: 50, items: [
    { label: "Vendors", href: "/team/vendors", ico: "⛟", icon: "store", enabled: true },
  ] },
];
