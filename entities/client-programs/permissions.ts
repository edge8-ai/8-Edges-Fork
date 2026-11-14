// Client programmes on the Admin view (ADR 0013). The portal's pages are declared with the rest of the portal (AC.14).
// Read as text by scripts/gen-deployment.mjs; nothing imports this file. Every
// atom is held by whoever reaches its pages today, so declaring it changes
// nothing until the guard swap.
import type { EntityPermissions } from "@/kernel/identity/permission-declaration";

/** @generator */
export const permissions: EntityPermissions = {
  permissions: {
    "client-programs.roadmaps": "See every client's roadmap",
    // Z.12: the weekly client status (seeded by migration 20261009190000 at
    // scope all for Admin and the Client status approver role). Since Z.12.1
    // nothing is released: the account owner shares the draft themselves, so
    // status-release keeps its key (the access rows name it) and now means
    // editing the draft and drafting it again. Since Z.12.2 (Khoa, 9 Oct 2026)
    // the client's own team holds both at scope clients: the account owner
    // opens the Weekly status page of each client whose team they are on, and
    // of no other, as a dashboard to read. Nothing notifies anyone of a draft.
    "client-programs.status": "Read a client's weekly status draft and its past weeks",
    "client-programs.status-release": "Edit a client's weekly status draft and draft it again",
  },
  holders: {
    "client-programs.roadmaps": "admin",
    "client-programs.status": "admin, client-team:clients",
    "client-programs.status-release": "admin, client-team:clients",
  },
  roles: {
    "client-status-approver": {
      "name": "Client status approver",
      "sentence": "Reads and edits each client's weekly status draft, which the account owner shares with the client.",
      "atoms": "client-programs.status, client-programs.status-release",
    },
  },
  routes: {
    "routes/admin/(dashboard)/edges/client-roadmaps/page": "client-programs.roadmaps",
    "routes/team/(dashboard)/clients/[companyId]/status/page": "client-programs.status",
  },
  actions: {
    "lib/roadmap-actions": "client-programs.roadmaps",
    "routes/team/(dashboard)/clients/[companyId]/status/actions": "client-programs.status-release",
  },
  implies: {},
};
