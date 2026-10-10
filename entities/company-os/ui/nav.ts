// What this entity contributes to the Admin shell's navigation (ADR 0002).
// The shell owns the information architecture (kernel/shell/admin-ia.ts) and
// names the slots; this file names the rows that belong in them. Drop the entity
// from a deployment and these rows go with it.
import type { NavContribution } from "@/kernel/shell/nav";

export const adminNav: NavContribution[] = [
  { section: "Operating System", group: "Edges", order: 10, items: [
    { label: "Company Dashboard", href: "/admin", ico: "◈", enabled: true },
  ] },
  { section: "Operating System", group: "Edges", order: 30, items: [
    { label: "Client Hubs", href: "/admin/client-hubs", ico: "▦", enabled: true },  // replaces the standalone Work Boards + Client Roadmaps: pick a client, land on their hub
  ] },
  // After ideas' Sync and Issues, as it reads on the shipped sidebar.
  { section: "Operating System", group: "Edges", order: 50, items: [
    { label: "Reviews", href: "/admin/edges/reviews", ico: "✓" },
  ] },
  { section: "Four Offices", group: "Revenue", subheading: "Commerce", order: 10, items: [
    { label: "Orders", href: "/admin/revenue/orders", ico: "⛁", enabled: true },
    { label: "Invoices", href: "/admin/revenue/invoices", ico: "¤", enabled: true },
    { label: "AIO Pad", href: "/admin/revenue/aio-pad", ico: "⌂", enabled: true },
  ] },
  { section: "Four Offices", group: "Revenue", subheading: "Commerce", order: 30, items: [
    { label: "Products", href: "/admin/revenue/products", ico: "▦", enabled: true },
  ] },
  { section: "Four Offices", group: "Talent", order: 10, items: [
    { label: "Cockpit", href: "/admin/talent", ico: "◎", enabled: true },
  ] },
  { section: "Four Offices", group: "Operations", order: 10, items: [
    { label: "Cockpit", href: "/admin/operations", ico: "◎", enabled: true },
  ] },
  { section: "Four Offices", group: "Operations", subheading: "Contractors", order: 10, items: [
    { label: "Work Requests", href: "/admin/operations/contractor-requests", ico: "✎", enabled: true },
    { label: "Contractors", href: "/admin/operations/contractors", ico: "⚒", enabled: true },
    { label: "Payments", href: "/admin/operations/contractor-payments", ico: "$", enabled: true },
  ] },
  { section: "Four Offices", group: "Operations", subheading: "Workplace", order: 20, items: [
    { label: "Vendors", href: "/admin/operations/vendors", ico: "▥", enabled: true },
    { label: "Gallery", href: "/admin/operations/gallery", ico: "▦", enabled: true },
  ] },
  { section: "Four Offices", group: "Operations", subheading: "Insights", order: 10, items: [
    { label: "Analytics", href: "/admin/operations/analytics", ico: "▲", enabled: true },
  ] },
  { section: "Workspace", group: "Settings", subheading: "Access", order: 10, items: [
    // Roles and grants (ADR 0013): shown to whoever holds access.manage.
    { label: "Roles & grants", href: "/admin/settings/access", ico: "⚖", enabled: true },
    { label: "Assume", href: "/admin/settings/assume", ico: "⧉", enabled: true },
  ] },
  { section: "Workspace", group: "Settings", subheading: "Configuration", order: 20, items: [
    { label: "QuickBooks", href: "/admin/settings/quickbooks", ico: "⌁", enabled: true },
  ] },
  { section: "Workspace", group: null, order: 10, items: [
    { label: "Agents", href: "/admin/settings/agents", ico: "⟳", enabled: true },
    { label: "Access codes", href: "/admin/settings/access-codes", ico: "⚷", enabled: true },
  ] },
];
