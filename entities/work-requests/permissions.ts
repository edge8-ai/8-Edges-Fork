// The work-request flow's pages and actions (ADR 0013, ADR 0025). Read as text by
// scripts/gen-deployment.mjs; nothing imports this file.
//
// The flow moved here from portal and company-os with ADR 0025. Its screens kept
// the atoms they had until A.89 gave them this entity's names: the admin
// Operations screens' work-requests.operations (was company-os.operations) and
// a contractor's own page's work-requests.contractor-work (was
// portal.contractor-work). The portal pages need only surface.portal, as every
// portal page does.
import type { EntityPermissions } from "@/kernel/identity/permission-declaration";

/** @generator */
export const permissions: EntityPermissions = {
  permissions: {
    "work-requests.operations": "Run contractor operations: contractors, their requests and their payments",
    "work-requests.contractor-work": "See your own contractor work: requests, the hours reported and each month's payment",
  },
  holders: {
    "work-requests.operations": "admin",
    // Every contractor, for their own records only (Dave, 2026-10-10).
    "work-requests.contractor-work": "contractor:own",
  },
  routes: {
    "routes/admin/(dashboard)/operations/contractor-payments/page": "work-requests.operations",
    "routes/admin/(dashboard)/operations/contractor-requests/page": "work-requests.operations",
    "routes/admin/(dashboard)/operations/contractor-requests/new/page": "work-requests.operations",
    "routes/admin/(dashboard)/operations/contractors/page": "work-requests.operations",
    "routes/portal/(dashboard)/requests/[id]/page": "surface.portal",
    "routes/portal/(dashboard)/requests/new/page": "surface.portal",
    // A contractor's own work requests and payments, in the Team view.
    "routes/team/(dashboard)/my-work/page": "work-requests.contractor-work",
  },
  actions: {
    // A contractor reporting hours from the Contractors board, on the Team view.
    "lib/contractor-card-actions": "surface.team",
    "routes/admin/(dashboard)/operations/contractor-payments/actions": "work-requests.operations",
    "routes/admin/(dashboard)/operations/contractor-requests/actions": "work-requests.operations",
    "routes/admin/(dashboard)/operations/contractors/actions": "work-requests.operations",
    "routes/portal/(dashboard)/requests/actions": "surface.portal",
  },
  implies: {},
};
