// The slots quests provides (ADR 0026): the Asks row's count, as the team
// sidebar shows it without the team layout naming this entity. The generator
// (scripts/gen-deployment.mjs) reads `slots` and writes app/shell.ts from it;
// nothing imports it.
import type { SlotDeclarations } from "@/kernel/shell/page-slots";

/** @generator */
export const slots: SlotDeclarations = {
  // AK.2: the team sidebar counts the asks waiting on the person on the Asks
  // row, beside the Inbox's count, by row address. A deployment without quests
  // has no Asks row and draws no count.
  asksNavCounts: {
    kind: "value",
    type: "(personId: string) => Promise<Record<string, number>>",
    fallback: "async (_personId: string): Promise<Record<string, number>> => ({})",
    styles: [],
    surfaces: ["team"],
    why: "how many asks wait on the person, by the Asks row's address; nothing when quests is not installed",
  },
};
