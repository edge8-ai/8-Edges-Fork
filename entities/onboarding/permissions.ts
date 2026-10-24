// Onboarding on the Admin view (ADR 0013).
// Read as text by scripts/gen-deployment.mjs; nothing imports this file. Every
// atom is held by whoever reaches its pages today, so declaring it changes
// nothing until the guard swap.
import type { EntityPermissions } from "@/kernel/identity/permission-declaration";

/** @generator */
export const permissions: EntityPermissions = {
  permissions: {
    "onboarding.manage": "Plan and follow new hires' onboarding",
    "onboarding.mine": "Follow your own onboarding plan",
    "onboarding.reports": "Follow your reports' onboarding, from pre-boarding to the stay interview",
  },
  holders: {
    "onboarding.manage": "admin",
    "onboarding.mine": "team-member:own, contractor:own",
    "onboarding.reports": "manager:team",
  },
  routes: {
    "routes/admin/(dashboard)/talent/onboarding/page": "onboarding.manage",
    "routes/admin/(dashboard)/talent/onboarding/plan/[id]/page": "onboarding.manage",
    // A manager's board of their reports' onboarding (AC.8); a person's own plan below.
    "routes/team/(dashboard)/onboarding/page": "onboarding.reports",
    "routes/team/(dashboard)/onboarding/plan/[id]/page": "onboarding.mine",
  },
  actions: {
    "routes/admin/(dashboard)/talent/onboarding/actions": "onboarding.manage",
    "routes/team/(dashboard)/onboarding/actions": "onboarding.reports",
  },
  implies: {},
};
