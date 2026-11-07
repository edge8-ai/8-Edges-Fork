// The work-request flow's pages and actions (ADR 0013, ADR 0025). Read as text by
// scripts/gen-deployment.mjs; nothing imports this file.
//
// The flow moved here from portal and company-os with ADR 0025, and its screens
// keep the atoms they had (Khoa, 2026-11-01): the admin Operations screens keep
// company-os.operations and a contractor's own page keeps portal.contractor-work,
// each carried in scripts/access-carried-atoms.json until a card renames them.
// The portal pages need only surface.portal, as every portal page does.
import type { EntityPermissions } from "@/kernel/identity/permission-declaration";

/** @generator */
export const permissions: EntityPermissions = {
  permissions: {},
  holders: {},
  routes: {
    "routes/admin/(dashboard)/operations/contractor-payments/page": "company-os.operations",
    "routes/admin/(dashboard)/operations/contractor-requests/page": "company-os.operations",
    "routes/admin/(dashboard)/operations/contractor-requests/new/page": "company-os.operations",
    "routes/admin/(dashboard)/operations/contractors/page": "company-os.operations",
    "routes/portal/(dashboard)/requests/[id]/page": "surface.portal",
    "routes/portal/(dashboard)/requests/new/page": "surface.portal",
    // A contractor's own work requests and payments, in the Team view.
    "routes/team/(dashboard)/my-work/page": "portal.contractor-work",
  },
  actions: {
    // A contractor reporting hours from the Contractors board, on the Team view.
    "lib/contractor-card-actions": "surface.team",
    "routes/admin/(dashboard)/operations/contractor-payments/actions": "company-os.operations",
    "routes/admin/(dashboard)/operations/contractor-requests/actions": "company-os.operations",
    "routes/admin/(dashboard)/operations/contractors/actions": "company-os.operations",
    "routes/portal/(dashboard)/requests/actions": "surface.portal",
  },
  implies: {},
};
