// Shared vocabulary for the one assistant chat widget (ChatWidget.tsx,
// ChatPanel.tsx, use-chat-session.ts). It sits in its own file because the
// 250-line cap splits the widget across three modules and all three speak these
// types; nothing here has a runtime value, so importing it costs nothing.

import type { ReactNode } from "react";
import type { Surface } from "./ConversationHistory";

export type ApprovalStatus = "pending" | "approved" | "declined";

export type ChatApprovalItem = {
  kind: "approval";
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: ApprovalStatus;
};

/** One rendered row of the transcript. Persisted verbatim to sessionStorage. */
export type ChatDisplayItem =
  | { kind: "user"; text: string }
  | { kind: "bot"; text: string; streaming?: boolean }
  | { kind: "tool"; detail: string; name?: string }
  | ChatApprovalItem
  | { kind: "error"; text: string };

/** Frames the chat routes stream back over SSE. */
export type ChatSseEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; detail: string }
  | { type: "approval"; id: string; name: string; input: Record<string, unknown> }
  | { type: "error"; error: string }
  | { type: "done"; messages: unknown[]; conversationId?: string | null; title?: string | null };

export type ChatWidgetProps = {
  /** POST target for a turn; receives `{ messages, displayItems, decision?, conversationId }`. */
  endpoint: string;
  /** sessionStorage key holding the active conversation for this surface. */
  storageKey: string;
  /** Which conversation list the History tab reads. */
  surface: Surface;
  /** aria-label on the floating button. */
  fabLabel: string;
  /** aria-label on the panel dialog. */
  panelLabel: string;
  /** Small-caps line above the panel title. */
  eyebrow: string;
  /** Body of the "no messages yet" block — surface-owned copy. */
  emptyState: ReactNode;
  /** Label for a tool chip, given the tool name the stream reported (if any). */
  toolChipLabel: (name: string | undefined) => string;
  /** Composer placeholder in the normal state. */
  placeholder: string;
  /** aria-label on the composer input. */
  inputLabel: string;
  /** Empty-list hint inside the History tab. */
  historyEmptyHint: string;
  /**
   * Approval affordances, admin-only. When absent the widget ignores `approval`
   * stream events and never gates the composer, so a read-only surface behaves
   * exactly as it did before this component existed. The card itself is
   * rendered by the caller because its copy is company-os domain text, and
   * assistant (layer 3) must not carry another entity's wording.
   */
  approvals?: {
    render: (args: {
      item: ChatApprovalItem;
      disabled: boolean;
      onDecide: (id: string, approved: boolean) => void;
    }) => ReactNode;
    /** Composer placeholder while a card is awaiting a decision. */
    pendingPlaceholder: string;
  };
};
