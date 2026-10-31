// The slots boards provides (ADR 0026): a card, as the Inbox shows it without
// notifications requiring boards. The generator (scripts/gen-deployment.mjs)
// reads `slots` and writes app/shell.ts from it; nothing imports it.
import type { ReactNode } from "react";
import type { SlotDeclarations } from "@/kernel/shell/page-slots";

/**
 * Who is asking to open a card, as the page that hosts the card already knows
 * them: their person, their seat (for client-board access) and whether their
 * surface lets them open every board.
 */
export type CardViewer = { personId: string; teamMemberId: string | null; seesEveryBoard: boolean };

/**
 * One card opened in place, over the page that asked (TH.2.6): the Inbox opens
 * a card's own drawer without leaving the list. `closeHref` is where closing
 * the drawer goes, which is the host page without its `?card=`.
 */
export type CardPeekSlot = ((props: { taskId: string; viewer: CardViewer; section: "/team" | "/admin"; closeHref: string }) => Promise<ReactNode>) | null;

/**
 * What the team Inbox knows about a card its due reminders name (TH.8): its
 * title, whether it is still work (open, not finished, set aside or archived),
 * and the card it belongs to when it is a subtask.
 */
export type InboxCardFact = { id: string; title: string; open: boolean; parent: { id: string; title: string } | null };
/** Those facts for a list of cards, or null when they could not be read; a card missing from the map is no longer work. */
export type InboxCardFactsSlot = ((ids: string[]) => Promise<Map<string, InboxCardFact> | null>) | null;

/** @generator */
export const slots: SlotDeclarations = {
  // TH.2.6: the Inbox opens a card's own drawer in place, without
  // notifications requiring boards. A deployment without boards has no cards
  // to open, and its inbox rows keep their links. The drawer draws with
  // admin.css, which every shell loads.
  CardPeek: {
    kind: "component",
    type: "CardPeekSlot",
    styles: [],
    surfaces: ["admin", "team"],
    why: "one card's drawer opened over the page that asked; nothing when boards is not installed",
  },
  // TH.8: the team Inbox leaves out reminders about cards already finished
  // and groups subtasks under their card, which it can only ask boards.
  inboxCardFacts: {
    kind: "value",
    type: "InboxCardFactsSlot",
    fallback: "null",
    styles: [],
    surfaces: ["team"],
    why: "whether the cards the Inbox's reminders name are still work, and their parents; nothing when boards is not installed",
  },
};
