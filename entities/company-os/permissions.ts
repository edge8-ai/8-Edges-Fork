// What the Admin view's own pages offer: operations, client hubs and settings (ADR 0013). Revenue pages are declared with the rest of Revenue (AC.12, AC.13).
// Read as text by scripts/gen-deployment.mjs; nothing imports this file. Every
// atom is held by whoever reaches its pages today, so declaring it changes
// nothing until the guard swap.
import type { EntityPermissions } from "@/kernel/identity/permission-declaration";

/** @generator */
export const permissions: EntityPermissions = {
  permissions: {
    "company-os.operations": "Run operations: contractors, contractor requests and payments, vendors, analytics and the gallery",
    "company-os.clients": "See every client hub, and view a client's portal as them",
    "company-os.settings": "Change the Admin view's settings: access codes, QuickBooks and the admins list",
    "company-os.agents": "Configure the assistants' agents",
    // Y.25: seeing a routine and stopping or starting it differ, so the
    // controls have their own atom.
    "company-os.routine-control": "Turn a routine off and on, run it now, and settle a send whose outcome is unknown, on Settings → Agents",
    "company-os.commerce": "Run commerce: products, orders and the AIO pad",
    // Each rode on entering the Admin view until AE.3 (ADR 0014).
    "company-os.quickbooks": "Connect a QuickBooks company to the Company OS",
    "company-os.publish-editor": "Run the Publish Editor agent on a marketing asset",
  },
  holders: {
    "company-os.operations": "admin",
    "company-os.clients": "admin",
    "company-os.settings": "admin",
    "company-os.agents": "admin, super-admin",
    "company-os.routine-control": "admin, super-admin",
    "company-os.commerce": "admin, revenue",
    "company-os.quickbooks": "admin",
    "company-os.publish-editor": "admin",
  },
  routes: {
    "routes/admin/(auth)/login/page": "public",
    "routes/admin/(auth)/reset-password/page": "public",
    "routes/admin/(auth)/verify/page": "public",
    "routes/admin/(dashboard)/page": "surface.admin",
    // The kernel's refusal page (AC.16): anyone on the surface may open it.
    "routes/admin/(dashboard)/refused/page": "surface.admin",
    "routes/admin/(dashboard)/patterns/page": "surface.admin",
    "routes/admin/(dashboard)/patterns/public/page": "surface.admin",
    "routes/admin/(dashboard)/talent/page": "surface.admin",
    "routes/admin/(dashboard)/operations/page": "company-os.operations",
    "routes/admin/(dashboard)/operations/analytics/page": "company-os.operations",
    "routes/admin/(dashboard)/operations/contractor-payments/page": "company-os.operations",
    "routes/admin/(dashboard)/operations/contractor-requests/page": "company-os.operations",
    "routes/admin/(dashboard)/operations/contractor-requests/new/page": "company-os.operations",
    "routes/admin/(dashboard)/operations/contractors/page": "company-os.operations",
    "routes/admin/(dashboard)/operations/gallery/page": "company-os.operations",
    "routes/admin/(dashboard)/operations/vendors/page": "company-os.operations",
    "routes/admin/(dashboard)/operations/vendors/new/page": "company-os.operations",
    "routes/admin/(dashboard)/client-hubs/page": "company-os.clients",
    "routes/admin/(dashboard)/settings/assume/page": "company-os.clients",
    "routes/admin/(dashboard)/settings/access-codes/page": "company-os.settings",
    "routes/admin/(dashboard)/settings/quickbooks/page": "company-os.settings",
    // Readable with access.explain for the Invitations tab (AE.4); the page shows the rest only to access.manage.
    "routes/admin/(dashboard)/settings/access/page": "access.explain",
    "routes/admin/(dashboard)/settings/agents/page": "company-os.agents",
    "routes/admin/(dashboard)/settings/agents/[id]/page": "company-os.agents",
    // Commerce, in the Revenue section of both views: admins and the Revenue role,
    // as requireRevenueAccess allowed. Invoices left for finance.invoices (AE.3).
    "routes/admin/(dashboard)/revenue/aio-pad/page": "company-os.commerce",
    "routes/admin/(dashboard)/revenue/orders/page": "company-os.commerce",
    "routes/admin/(dashboard)/revenue/products/page": "company-os.commerce",
    "routes/team/(dashboard)/revenue/aio-pad/page": "company-os.commerce",
    "routes/team/(dashboard)/revenue/orders/page": "company-os.commerce",
    "routes/team/(dashboard)/revenue/products/page": "company-os.commerce",
  },
  actions: {
    // The invite drawer, Resend and Cancel (AE.4); the Invitations tab itself reads with access.explain.
    "lib/access-invite-actions": "access.manage",
    "lib/check-in/check-in-actions": "company-os.agents",
    "lib/gallery-actions": "company-os.operations",
    "lib/staff-assignments-actions": "company-os.operations",
    "routes/admin/(dashboard)/operations/contractor-payments/actions": "company-os.operations",
    "routes/admin/(dashboard)/operations/contractor-requests/actions": "company-os.operations",
    "routes/admin/(dashboard)/operations/contractors/actions": "company-os.operations",
    "routes/admin/(dashboard)/operations/vendors/actions": "company-os.operations",
    "routes/admin/(dashboard)/settings/access-codes/actions": "company-os.settings",
    "routes/admin/(dashboard)/settings/access/actions": "access.manage",
    "routes/admin/(dashboard)/settings/agents/actions": "company-os.routine-control",
  },
  implies: {},
};
