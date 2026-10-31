// The slots coaching provides (ADR 0026). The generator
// (scripts/gen-deployment.mjs) reads `slots` and writes app/shell.ts from it;
// nothing imports it.
import type { ReactNode } from "react";
import type { SlotDeclarations } from "@/kernel/shell/page-slots";

/** The reader's open coaching commitments on My Week (L.18.3), due inside the sprint window first. */
export type MyWeekCommitmentsSlot = ((props: { startsOn: string; endsOn: string }) => Promise<ReactNode>) | null;

/** @generator */
export const slots: SlotDeclarations = {
  // L.18.3: coaching's commitments on My Week. Boards may not require
  // coaching (coaching requires boards), so the page takes them here.
  MyWeekCommitments: {
    kind: "component",
    type: "MyWeekCommitmentsSlot",
    styles: [],
    surfaces: ["team"],
    why: "the reader's open coaching commitments on My Week; nothing when coaching is not installed",
  },
};
