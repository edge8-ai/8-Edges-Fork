// What this entity contributes to the Admin shell's navigation (ADR 0002).
// The shell owns the information architecture (kernel/shell/admin-ia.ts) and
// names the slots; this file names the rows that belong in them. Drop the entity
// from a deployment and these rows go with it.
import type { NavContribution } from "@/kernel/shell/nav";

export const adminNav: NavContribution[] = [
  { section: "Operating System", group: "Company", order: 10, items: [
    { label: "Strategy", href: "/admin/company/strategy", ico: "◆", enabled: true },
    { label: "Company Goals", href: "/admin/company/goals", ico: "⊚", enabled: true },
    { label: "Core Values", href: "/admin/company/values", ico: "♥", enabled: true },
    { label: "Org Chart", href: "/admin/company/org", ico: "⌥", enabled: true },
    { label: "Onboarding Deck", href: "/admin/company/onboarding-deck", ico: "▷", enabled: true },
  ] },
  { section: "Four Offices", group: "Talent", subheading: "People", order: 10, items: [
    { label: "Team", href: "/admin/talent/team", ico: "☷", enabled: true },
  ] },
  { section: "Four Offices", group: "Talent", subheading: "People", order: 30, items: [
    { label: "Probation", href: "/admin/talent/probation", ico: "◔", enabled: true },
  ] },
  // Top level of the office, beside the cockpit rather than under a System:
  // "can we take this work?" is a question about the whole of Operations.
  { section: "Four Offices", group: "Operations", order: 20, items: [
    { label: "Capacity", href: "/admin/operations/capacity", ico: "◧", enabled: true },
  ] },
  { section: "Four Offices", group: "Operations", subheading: "Workplace", order: 10, items: [
    { label: "Equipment", href: "/admin/operations/equipment", ico: "▤", enabled: true },
  ] },
  { section: "Four Offices", group: "Operations", subheading: "Workplace", order: 40, items: [
    { label: "Surveys", href: "/admin/operations/surveys", ico: "✎", enabled: true },
  ] },
  // The organisation's registered companies: legal names and tax codes that
  // other screens (a reimbursement claim's red-invoice hint) read.
  { section: "Workspace", group: "Settings", subheading: "Configuration", order: 30, items: [
    { label: "Legal entities", href: "/admin/settings/legal-entities", ico: "§", enabled: true },
  ] },
];
