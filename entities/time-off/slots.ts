// The slots time-off provides (ADR 0026). The generator
// (scripts/gen-deployment.mjs) reads `slots` and writes app/shell.ts from it;
// nothing imports it.
import type { ReactNode } from "react";
import type { Access } from "@/kernel/identity/access-model";
import type { SlotDeclarations } from "@/kernel/shell/page-slots";

/**
 * Everything waiting on the reader's decision, for the team Inbox (TH.11):
 * approvals named on them, on a role they hold, and the admins' pool they can
 * reach, with leave decided in its row. The count feeds the Inbox's chip and
 * headline; the node is the Decisions section itself.
 */
export type InboxDecisionsSlot = ((props: { personId: string; viewer: Pick<Access, "may" | "permissions" | "roles"> }) => Promise<{ count: number; node: ReactNode }>) | null;

/** @generator */
export const slots: SlotDeclarations = {
  // TH.11: the team Inbox's Decisions, from time-off, which owns the one
  // decision written in place (leave). A deployment without time-off has no
  // Decisions section; the approvals still wait where they are decided. The
  // section draws with the Inbox's own sheet, which its page loads.
  inboxDecisions: {
    kind: "component",
    type: "InboxDecisionsSlot",
    styles: [],
    surfaces: ["team"],
    why: "everything waiting on the reader's decision, in the team Inbox; nothing when time-off is not installed",
  },
};
