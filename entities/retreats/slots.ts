// The slots retreats provides (ADR 0026). The generator
// (scripts/gen-deployment.mjs) reads `slots` and writes app/shell.ts from it;
// nothing imports it.
import type { SlotDeclarations } from "@/kernel/shell/page-slots";

/** @generator */
export const slots: SlotDeclarations = {
  avatarUrlForAuthUser: {
    kind: "value",
    type: "(userId: string) => Promise<string | null>",
    fallback: "async (_userId: string): Promise<string | null> => null",
    styles: [],
    surfaces: ["admin"],
    why: "the signed-in admin's avatar; no avatar when retreats (which owns the media) is not installed",
  },
};
