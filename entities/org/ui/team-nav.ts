// What this entity contributes to the team hub's navigation (ADR 0002). The
// shell owns the information architecture (kernel/shell/team-ia.ts) and names
// the slots; this file names the rows that belong in them. A row appears
// only to someone who may open its page (its declared permission, ADR 0013).
import type { NavContribution } from "@/kernel/shell/nav";

export const teamNav: NavContribution[] = [
  // Reviews and Kudos moved here from team with their tables (ADR 0025); each
  // keeps its place: Reviews in Me after My Week, Kudos after Gallery.
  { section: null, group: "Me", order: 30, items: [
    { label: "Reviews", href: "/team/reviews", ico: "★", icon: "clipboard", enabled: true },
  ] },
  { section: null, group: "Company", order: 21, items: [
    { label: "Kudos", href: "/team/kudos", ico: "♡", icon: "award", enabled: true },
  ] },
  { section: null, group: "Company", order: 10, items: [
    { label: "Strategy", href: "/team/strategy", ico: "◆", icon: "map", enabled: true },
    { label: "Company Goals", href: "/team/company-goals", ico: "⊚", icon: "target", enabled: true },
    { label: "Core Values", href: "/team/values", ico: "♥", icon: "heart", enabled: true },
    { label: "Org Chart", href: "/team/org", ico: "⌥", icon: "network", enabled: true },
  ] },
];
