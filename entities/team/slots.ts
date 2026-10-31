// The slots team provides (ADR 0026). The generator
// (scripts/gen-deployment.mjs) reads `slots` and writes app/shell.ts from it;
// nothing imports it.
import type { SlotDeclarations } from "@/kernel/shell/page-slots";

/** @generator */
export const slots: SlotDeclarations = {
  // TH.29: the account menu's View profile from Admin. A member's profile is
  // a Team page, which the Admin layout may not name, and a deployment
  // without Team has no profile to view.
  PROFILE_HREF: {
    kind: "value",
    type: "string | null",
    fallback: "null",
    styles: [],
    surfaces: ["admin"],
    why: "where the Admin account menu's View profile leads; none when Team is not installed",
  },
};
