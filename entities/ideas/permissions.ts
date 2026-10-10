// Ideas, issues and sync packets on the Admin view (ADR 0013).
// Read as text by scripts/gen-deployment.mjs; nothing imports this file. Every
// atom is held by whoever reaches its pages today, so declaring it changes
// nothing until the guard swap.
import type { EntityPermissions } from "@/kernel/identity/permission-declaration";

/** @generator */
export const permissions: EntityPermissions = {
  permissions: {
    "ideas.manage": "Triage ideas, issues and sync packets",
  },
  holders: {
    "ideas.manage": "admin",
  },
  routes: {
    "routes/admin/(dashboard)/edges/issues/page": "ideas.manage",
    "routes/admin/(dashboard)/edges/sync/page": "ideas.manage",
    "routes/admin/(dashboard)/innovation/ideas/page": "ideas.manage",
    "routes/admin/(dashboard)/innovation/page": "ideas.manage",
  },
  actions: {
    "routes/admin/(dashboard)/edges/issues/actions": "ideas.manage",
    "routes/admin/(dashboard)/innovation/ideas/actions": "ideas.manage",
  },
  implies: {},
};
