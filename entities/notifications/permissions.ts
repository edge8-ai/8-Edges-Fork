// The inbox (ADR 0013). A person's own inbox needs nothing beyond entering the view.
// Read as text by scripts/gen-deployment.mjs; nothing imports this file. Every
// atom is held by whoever reaches its pages today, so declaring it changes
// nothing until the guard swap.
import type { EntityPermissions } from "@/kernel/identity/permission-declaration";

/** @generator */
export const permissions: EntityPermissions = {
  permissions: {},
  holders: {},
  routes: {
    "routes/admin/(dashboard)/inbox/page": "surface.admin",
    "routes/team/(dashboard)/inbox/page": "surface.team",
  },
  actions: {
    "routes/admin/(dashboard)/inbox/actions": "surface.admin",
    "routes/team/(dashboard)/inbox/actions": "surface.team",
  },
  implies: {},
};
