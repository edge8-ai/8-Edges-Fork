// The slots crm provides (ADR 0026). The generator
// (scripts/gen-deployment.mjs) reads `slots` and writes app/shell.ts from it;
// nothing imports it.
import type { SprintMeetings } from "@/entities/boards";
import type { SlotDeclarations } from "@/kernel/shell/page-slots";

/** The sprint page's meeting picker and brief draft, loaded per request; null when crm is not installed. */
export type SprintMeetingsSlot = (() => Promise<SprintMeetings>) | null;

/** @generator */
export const slots: SlotDeclarations = {
  // ADR 0032: a sprint's planning meeting and the brief drafted from its
  // transcript are crm's enrichment of boards' sprint page. boards dropped its
  // edge to crm, so the page takes them here, and a Workboard without a CRM
  // shows a sprint with no planning meeting. Admin only: the team sprint page
  // reads crm's door instead, because team requires crm (ADR 0026).
  sprintMeetings: {
    kind: "value",
    type: "SprintMeetingsSlot",
    fallback: "null",
    styles: [],
    surfaces: ["admin"],
    why: "the sprint page's meeting picker and the brief drafted from the attached meeting; no planning meeting without crm",
  },
};
