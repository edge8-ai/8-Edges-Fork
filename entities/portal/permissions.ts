// The client portal's pages (ADR 0013). Read as text by scripts/gen-deployment.mjs;
// nothing imports this file.
//
// Every portal page needs only surface.portal, which a client company's members
// hold as Client user; the sign-in pages are public. What a client bought (the
// portal's entitlements) and the portal-admin pages' own checks stay exactly as
// they are: the portal joins the vocabulary with no client-visible change (AC.14).
import type { EntityPermissions } from "@/kernel/identity/permission-declaration";

/** @generator */
export const permissions: EntityPermissions = {
  permissions: {},
  holders: {},
  routes: {
    "routes/portal/(auth)/callback/page": "public",
    "routes/portal/(auth)/change-password/page": "surface.portal",
    "routes/portal/(auth)/login/page": "public",
    "routes/portal/(auth)/verify/page": "public",
    "routes/portal/(dashboard)/agreements/[id]/page": "surface.portal",
    "routes/portal/(dashboard)/company/page": "surface.portal",
    "routes/portal/(dashboard)/events/page": "surface.portal",
    "routes/portal/(dashboard)/hub/page": "surface.portal",
    "routes/portal/(dashboard)/invoices/page": "surface.portal",
    "routes/portal/(dashboard)/meetings/[id]/page": "surface.portal",
    "routes/portal/(dashboard)/page": "surface.portal",
    "routes/portal/(dashboard)/profile/page": "surface.portal",
    "routes/portal/(dashboard)/programs/[id]/page": "surface.portal",
    "routes/portal/(dashboard)/programs/add/page": "surface.portal",
    "routes/portal/(dashboard)/programs/add/plan/page": "surface.portal",
    "routes/portal/(dashboard)/programs/add/upload/page": "surface.portal",
    "routes/portal/(dashboard)/programs/page": "surface.portal",
    "routes/portal/(dashboard)/referrals/page": "surface.portal",
    "routes/portal/(dashboard)/requests/[id]/page": "surface.portal",
    "routes/portal/(dashboard)/requests/hire/page": "surface.portal",
    "routes/portal/(dashboard)/requests/new/page": "surface.portal",
    "routes/portal/(dashboard)/requests/page": "surface.portal",
    "routes/portal/(dashboard)/team/page": "surface.portal",
    "routes/portal/(dashboard)/time-off/page": "surface.portal",
    "routes/portal/(dashboard)/tokens/page": "surface.portal",
    "routes/portal/(dashboard)/users/page": "surface.portal",
  },
  actions: {
    // Ends an Assume session: the admin's, not the client's.
    "lib/actions": "surface.admin",
    // A contractor reporting hours from the Contractors board, on the Team view.
    "lib/contractor-card-actions": "surface.team",
    "routes/portal/(dashboard)/agreements/[id]/actions": "surface.portal",
    "routes/portal/(dashboard)/company/actions": "surface.portal",
    "routes/portal/(dashboard)/documents/actions": "surface.portal",
    "routes/portal/(dashboard)/profile/actions": "surface.portal",
    "routes/portal/(dashboard)/programs/actions": "surface.portal",
    "routes/portal/(dashboard)/referrals/actions": "surface.portal",
    "routes/portal/(dashboard)/requests/actions": "surface.portal",
    "routes/portal/(dashboard)/roadmap/actions": "surface.portal",
    "routes/portal/(dashboard)/time-off/actions": "surface.portal",
    "routes/portal/(dashboard)/tokens/actions": "surface.portal",
    "routes/portal/(dashboard)/users/actions": "surface.portal",
  },
  implies: {},
};
