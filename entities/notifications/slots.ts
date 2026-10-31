// The slots notifications provides (ADR 0026): the inbox, as the shells and
// another entity's page show it without requiring this entity. The generator
// (scripts/gen-deployment.mjs) reads `slots` and writes app/shell.ts from it;
// nothing imports it.
import type { ReactNode } from "react";
import type { SlotDeclarations } from "@/kernel/shell/page-slots";

/** One line about the reader's unread inbox, or nothing when there is nothing new. */
export type InboxLineSlot = ((props: { personId: string }) => Promise<ReactNode>) | null;

/** @generator */
export const slots: SlotDeclarations = {
  INBOX_HREF: {
    kind: "value",
    type: "string | null",
    fallback: "null",
    styles: [],
    surfaces: ["admin"],
    why: "where the admin sidebar's envelope leads; no envelope when there is no inbox to open",
  },
  // TH.8: the team sidebar counts what waits on the person, by row address:
  // the Inbox's asks from teammates. The team layout may not name the entity
  // that owns the inbox, and a deployment without it draws no count.
  teamNavCounts: {
    kind: "value",
    type: "(personId: string) => Promise<Record<string, number>>",
    fallback: "async (_personId: string): Promise<Record<string, number>> => ({})",
    styles: [],
    surfaces: ["team"],
    why: "what the team sidebar counts, by row address; nothing when there is no inbox",
  },
  // The first slot a PAGE took rather than a shell (W.169.4): the generated
  // My Week mount passes it to the boards page (boards' mounts.ts, `slots`).
  InboxLine: {
    kind: "component",
    type: "InboxLineSlot",
    styles: [],
    surfaces: ["team"],
    why: "the inbox in one line on My Week; nothing when there is no inbox",
  },
};
