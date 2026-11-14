// The slots portal provides (ADR 0026). The generator
// (scripts/gen-deployment.mjs) reads `slots` and writes app/shell.ts from it;
// nothing imports it.
import type { SlotDeclarations } from "@/kernel/shell/page-slots";

/** @generator */
export const slots: SlotDeclarations = {
  // ADR 0025: the portal shell is the kernel's, so what it shows of this client
  // reaches the portal layout as slots. The layout is installed only with the
  // portal, so the fallbacks are what a shell with nothing bought would show.
  portalEntitlements: {
    kind: "value",
    type: "PortalEntitlementsSlot",
    typeFrom: "@/kernel/shell/surface-slots",
    fallback: "async (): Promise<Record<string, boolean>> => ({})",
    styles: [],
    surfaces: ["portal"],
    why: "which portal rows this client is entitled to; every gated row muted without the portal",
  },
  listProgramNamesForActor: {
    kind: "value",
    type: "PortalProgramNamesSlot",
    typeFrom: "@/kernel/shell/surface-slots",
    fallback: "async (): Promise<{ id: string; name: string }[]> => []",
    styles: [],
    surfaces: ["portal"],
    why: "one Delivery link per live program of the client; none without the portal",
  },
  endAssumeSession: {
    kind: "value",
    type: "EndPortalAssumeSlot",
    typeFrom: "@/kernel/shell/surface-slots",
    fallback: "null",
    styles: [],
    surfaces: ["portal"],
    why: "ends an admin's Assume view from the banner and the account menu",
  },
};
