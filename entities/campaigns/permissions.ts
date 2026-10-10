// Marketing, on the Admin and Team views alike (ADR 0013). Today requireRevenueAccess opens it to admins and to anyone with the revenue grant, which is the Revenue role.
// Read as text by scripts/gen-deployment.mjs; nothing imports this file. Every
// atom is held by whoever reaches its pages today, so declaring it changes
// nothing until the guard swap.
import type { EntityPermissions } from "@/kernel/identity/permission-declaration";

/** @generator */
export const permissions: EntityPermissions = {
  permissions: {
    "campaigns.marketing": "Run marketing: campaigns, broadcasts, audiences, brands, books, the calendar, the schedule and recaps",
  },
  holders: {
    "campaigns.marketing": "admin, revenue",
  },
  routes: {
    "routes/admin/(dashboard)/revenue/marketing/audiences/[id]/page": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/audiences/page": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/books/[slug]/page": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/books/page": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/brands/[slug]/page": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/brands/page": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/broadcasts/[id]/page": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/broadcasts/page": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/calendar/page": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/campaigns/[id]/assets/[assetId]/page": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/campaigns/[id]/page": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/campaigns/page": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/page": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/recaps/page": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/recurring/[id]/page": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/recurring/page": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/schedule/page": "campaigns.marketing",
    "routes/team/(dashboard)/revenue/marketing/books/[slug]/page": "campaigns.marketing",
    "routes/team/(dashboard)/revenue/marketing/books/page": "campaigns.marketing",
    "routes/team/(dashboard)/revenue/marketing/brands/[slug]/page": "campaigns.marketing",
    "routes/team/(dashboard)/revenue/marketing/brands/page": "campaigns.marketing",
    "routes/team/(dashboard)/revenue/marketing/broadcasts/[id]/page": "campaigns.marketing",
    "routes/team/(dashboard)/revenue/marketing/broadcasts/page": "campaigns.marketing",
    "routes/team/(dashboard)/revenue/marketing/calendar/page": "campaigns.marketing",
    "routes/team/(dashboard)/revenue/marketing/campaigns/[id]/assets/[assetId]/page": "campaigns.marketing",
    "routes/team/(dashboard)/revenue/marketing/campaigns/[id]/page": "campaigns.marketing",
    "routes/team/(dashboard)/revenue/marketing/campaigns/page": "campaigns.marketing",
    "routes/team/(dashboard)/revenue/marketing/page": "campaigns.marketing",
    "routes/team/(dashboard)/revenue/marketing/recaps/page": "campaigns.marketing",
  },
  actions: {
    "lib/letter/actions": "campaigns.marketing",
    "lib/writer/actions": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/audiences/actions": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/brands/actions": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/broadcasts/actions": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/broadcasts/missed-actions": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/broadcasts/send-actions": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/calendar/actions": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/campaigns/[id]/assets/[assetId]/actions": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/campaigns/actions": "campaigns.marketing",
    "routes/admin/(dashboard)/revenue/marketing/recurring/actions": "campaigns.marketing",
  },
  implies: {},
};
