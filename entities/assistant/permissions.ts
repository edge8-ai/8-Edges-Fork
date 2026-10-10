// The admin assistant's capabilities (ADR 0013, ADR 0014). Read as text by
// scripts/gen-deployment.mjs; nothing imports this file.
//
// Until AE.1 every admin assistant tool was handed to whoever entered the
// Admin view, so opening that view to a narrow role (an accountant) would have
// handed it read-only SQL over the whole database. Each tool now names its own
// atom, held by Admin by declaration; Super Admin holds them through Admin.
// The table blocklist inside the query tool is not a permission and is not
// counted as one: the query tool stays off every bundle but Admin until the
// tool itself is scoped to the viewer's atoms. The write tools also still need
// the deploy-time list in lib/admin-chat/privileged.ts.
import type { EntityPermissions } from "@/kernel/identity/permission-declaration";

/** @generator */
export const permissions: EntityPermissions = {
  permissions: {
    "assistant.query": "Ask the admin assistant, which reads the database to answer",
    "assistant.write": "Let the admin assistant change data, send email and invite portal members, each after approval",
  },
  holders: {
    "assistant.query": "admin",
    "assistant.write": "admin",
  },
  routes: {},
  actions: {},
  implies: {},
};
