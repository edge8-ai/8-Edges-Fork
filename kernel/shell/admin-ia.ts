// The Admin surface's information architecture: the slots, in display order.
//
// Three labelled sections (agreed 2026-08-09, see
// docs/product/eight-edges/eight-edges-engineering-plan.md): OPERATING SYSTEM
// points the company (the dashboard and the Edges pages), FOUR OFFICES runs it
// (the nested-by-office IA: every feature lives under a System inside an Office,
// see docs/product/four-offices-of-the-future.md), WORKSPACE configures it.
// Offices and Systems both collapse.
//
// This file names no entity and holds no rows. Each entity contributes its rows
// to a slot from its browser-safe door, and app/nav.ts — generated from the
// deployment — hands the shell the contributions of the entities installed here
// (ADR 0002). A slot nobody contributes to is not rendered.
import type { NavSlot } from "./nav";
import type { NavIconName } from "./nav-icons";

const OS = "Operating System";
const OFFICES = "Four Offices";
const WORKSPACE = "Workspace";

export const ADMIN_SLOTS: NavSlot[] = [
  // Home (AH.2.1): the viewer's own page, above every section, the way the Team
  // surface opens on its own Home.
  { section: null, group: null },

  { section: OS, group: "Edges", collapsible: true },
  { section: OS, group: "Company", collapsible: true },

  { section: OFFICES, group: "Revenue", collapsible: true },
  { section: OFFICES, group: "Revenue", subheading: "CRM" },
  { section: OFFICES, group: "Revenue", subheading: "Commerce" },
  { section: OFFICES, group: "Revenue", subheading: "Marketing" },

  { section: OFFICES, group: "Talent", collapsible: true },
  { section: OFFICES, group: "Talent", subheading: "People" },
  { section: OFFICES, group: "Talent", subheading: "ATS" },

  { section: OFFICES, group: "Operations", collapsible: true },
  { section: OFFICES, group: "Operations", subheading: "Time Off" },
  { section: OFFICES, group: "Operations", subheading: "Contractors" },
  { section: OFFICES, group: "Operations", subheading: "Retreats" },
  { section: OFFICES, group: "Operations", subheading: "Workplace" },
  // Replenishment (RP.3): a warehouse's weekly runs and its profile.
  { section: OFFICES, group: "Operations", subheading: "Warehouse" },
  { section: OFFICES, group: "Operations", subheading: "Insights" },

  { section: OFFICES, group: "Innovation", collapsible: true },
  { section: OFFICES, group: "Innovation", subheading: "Ideas" },

  { section: WORKSPACE, group: "Settings", collapsible: true },
  { section: WORKSPACE, group: "Settings", subheading: "Access" },
  { section: WORKSPACE, group: "Settings", subheading: "Configuration" },
  // Agents sits at the top level of Workspace, a peer of Settings rather than
  // buried under it.
  { section: WORKSPACE, group: null },
];

// Each group's one icon when the sidebar is folded (./FoldedNav): the Admin
// rows carry text glyphs, so the group needs a drawing of its own.
export const ADMIN_GROUP_ICONS: Partial<Record<string, NavIconName>> = {
  Edges: "target",
  Company: "building",
  Revenue: "dollar",
  Talent: "people",
  Operations: "gauge",
  Innovation: "spark",
  Settings: "key",
};
