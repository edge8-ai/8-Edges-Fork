// The client portal's information architecture: the slots, in display order.
//
// Three groups: the work (Delivery), the people on it (People) and the client's
// own record (Account). Home stays ungrouped and renders as a top-level
// landmark, since it outranks the items inside the groups.
//
// This file names no entity and holds no rows — each entity contributes its
// rows from its browser-safe door and app/nav.ts composes the contributions of
// the entities this deployment installs (ADR 0002). A row gated on what this
// client bought carries a `when` entitlement key, which the sidebar resolves
// per request.
import type { NavSlot } from "./nav";

export const PORTAL_SLOTS: NavSlot[] = [
  { section: null, group: null },
  { section: null, group: "Delivery" },
  { section: null, group: "People" },
  { section: null, group: "Account" },
];
