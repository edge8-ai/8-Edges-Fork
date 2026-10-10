// The team hub's information architecture: the slots, in display order.
//
// Widening scope, which is the order a member reads it in: what I am doing now,
// then me, then the people I am responsible for, then the company. The groups
// collapse. Only Revenue has subsections, mirroring the admin Revenue office
// (CRM, Commerce, Marketing) so a member who works in both reads the same map.
//
// This file names no entity and holds no rows — each entity contributes its
// rows from its browser-safe door and app/nav.ts composes the contributions of
// the entities this deployment installs (ADR 0002). Which rows a viewer sees
// follows the permission each row's page declares (ADR 0013), resolved per
// request by the Team layout.
import type { NavSlot } from "./nav";

export const TEAM_SLOTS: NavSlot[] = [
  { section: null, group: null },
  { section: null, group: "My Work" },
  { section: null, group: "Me" },
  { section: null, group: "My Team" },
  // The Revenue section, for members whose roles reach its pages (Revenue grants).
  { section: null, group: "Revenue" },
  { section: null, group: "Revenue", subheading: "CRM" },
  { section: null, group: "Revenue", subheading: "Commerce" },
  { section: null, group: "Revenue", subheading: "Marketing" },
  // The Finance section, for members who check claims or pay them (RB.3): a
  // contractor in Finance works here without the Admin surface. Its rows show
  // only to a viewer whose access reaches their pages, so it is empty, and not
  // rendered, for everyone else.
  { section: null, group: "Finance" },
  { section: null, group: "Company" },
];
