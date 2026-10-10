// Time off on the Admin view (ADR 0013). The Team view's own time-off pages are declared with their scoping (AC.7).
// Read as text by scripts/gen-deployment.mjs; nothing imports this file. Every
// atom is held by whoever reaches its pages today, so declaring it changes
// nothing until the guard swap.
import type { EntityPermissions } from "@/kernel/identity/permission-declaration";

/** @generator */
export const permissions: EntityPermissions = {
  permissions: {
    "time-off.manage": "Run time off: requests, policies and history",
    "time-off.mine": "Request time off and see your own",
    "time-off.approve": "Approve your team's leave requests",
  },
  holders: {
    "time-off.manage": "admin",
    "time-off.mine": "team-member:own, contractor:own",
    // A manager, for their team's requests, or anyone a request is waiting on
    // (the Approver role). It guarded /team/approvals until Z.2.1 made that page
    // the inbox for every subject; the atom stays as what the two roles hold.
    "time-off.approve": "manager:team, approver:own",
  },
  routes: {
    "routes/admin/(dashboard)/operations/time-off/page": "time-off.manage",
    "routes/admin/(dashboard)/operations/time-off/history/page": "time-off.manage",
    "routes/admin/(dashboard)/operations/time-off/policies/page": "time-off.manage",
    "routes/admin/(dashboard)/operations/time-off/policies/[id]/page": "time-off.manage",
    "routes/admin/(dashboard)/operations/time-off/requests/page": "time-off.manage",
    // The Team view's own time off; the reach is what AC.7's swap reads.
    "routes/team/(dashboard)/time-off/page": "time-off.mine",
    // The approvals inbox (Z.2.1) lists what waits on whoever opens it, by the
    // approvals reader's rule, so every team login may open it: a Finance
    // checker or a Revenue approver has rows there without managing anyone.
    "routes/team/(dashboard)/approvals/page": "surface.team",
  },
  actions: {
    "routes/admin/(dashboard)/operations/time-off/policies/[id]/actions": "time-off.manage",
    "routes/admin/(dashboard)/operations/time-off/policies/actions": "time-off.manage",
    "routes/admin/(dashboard)/operations/time-off/requests/actions": "time-off.manage",
    "routes/team/(dashboard)/approvals/actions": "surface.team",
    "routes/team/(dashboard)/time-off/actions": "time-off.mine",
  },
  implies: {},
};
