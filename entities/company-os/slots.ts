// The slots company-os provides (ADR 0026). The generator
// (scripts/gen-deployment.mjs) reads `slots` and writes app/shell.ts from it;
// nothing imports it.
import type { SlotDeclarations } from "@/kernel/shell/page-slots";

/** @generator */
export const slots: SlotDeclarations = {
  // TH.29: the account menu's Client Hub, for staff the list of clients to
  // pick one from. The layouts may not name the entity that owns the page,
  // and a deployment without it offers no Client Hub to switch to.
  CLIENT_HUB_HREF: {
    kind: "value",
    type: "string | null",
    fallback: "null",
    styles: [],
    surfaces: ["admin", "team"],
    why: "where the account menu's Client Hub leads staff; no Client Hub when there is no list of clients",
  },
};
