// Retreats on the Admin view (ADR 0013). Event revenue pages are declared with the rest of Revenue (AC.12, AC.13).
// Read as text by scripts/gen-deployment.mjs; nothing imports this file. Every
// atom is held by whoever reaches its pages today, so declaring it changes
// nothing until the guard swap.
import type { EntityPermissions } from "@/kernel/identity/permission-declaration";

/** @generator */
export const permissions: EntityPermissions = {
  permissions: {
    "retreats.manage": "Run retreats and trips",
    "retreats.events": "Sell events: events, public retreats and registrations",
  },
  holders: {
    "retreats.manage": "admin",
    "retreats.events": "admin, revenue",
  },
  routes: {
    "routes/admin/(dashboard)/operations/retreats/page": "retreats.manage",
    // Event sales, in the Revenue section of both views: admins and the Revenue role, as requireRevenueAccess allows today.
    "routes/admin/(dashboard)/revenue/events/[id]/page": "retreats.events",
    "routes/admin/(dashboard)/revenue/events/page": "retreats.events",
    "routes/admin/(dashboard)/revenue/public-retreats/page": "retreats.events",
    "routes/admin/(dashboard)/revenue/registrations/page": "retreats.events",
    "routes/team/(dashboard)/revenue/events/[id]/page": "retreats.events",
    "routes/team/(dashboard)/revenue/events/page": "retreats.events",
    "routes/team/(dashboard)/revenue/public-retreats/page": "retreats.events",
    "routes/team/(dashboard)/revenue/registrations/page": "retreats.events",
  },
  actions: {
    "routes/admin/(dashboard)/revenue/events/[id]/actions": "retreats.events",
    "routes/admin/(dashboard)/revenue/events/[id]/agenda-actions": "retreats.events",
    "routes/admin/(dashboard)/revenue/events/[id]/pnl-actions": "retreats.events",
    "routes/admin/(dashboard)/revenue/events/actions": "retreats.events",
  },
  implies: {},
};
