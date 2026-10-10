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

const OS = "Operating System";
const OFFICES = "Four Offices";
const WORKSPACE = "Workspace";

export const ADMIN_SLOTS: NavSlot[] = [
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
  { section: OFFICES, group: "Operations", subheading: "Insights" },

  // Finance: the claims people are paid back for (RB.4), checked, approved and
  // seen here by whoever's access reaches each page.
  { section: OFFICES, group: "Finance", collapsible: true },
  { section: OFFICES, group: "Finance", subheading: "Reimbursements" },

  { section: OFFICES, group: "Innovation", collapsible: true },
  { section: OFFICES, group: "Innovation", subheading: "Ideas" },

  { section: WORKSPACE, group: "Settings", collapsible: true },
  { section: WORKSPACE, group: "Settings", subheading: "Access" },
  { section: WORKSPACE, group: "Settings", subheading: "Configuration" },
  // Agents sits at the top level of Workspace, a peer of Settings rather than
  // buried under it.
  { section: WORKSPACE, group: null },
];
