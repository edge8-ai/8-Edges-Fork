"use client";

// The one assistant chat widget: floating button + right slide-in panel,
// mounted in the admin and team dashboard layouts. Before this component the
// admin and team widgets were two ~89% identical copies that had already
// drifted in small ways; every difference between the two surfaces is now a
// prop (see chat-widget-types.ts).
//
// It lives in the assistant entity because the panel renders `BotText` and
// `ConversationHistory`, which belong to this entity — kernel/ui may not import
// entities, so kernel was not an option. Both callers mount the widget from a
// route file, and route files sit outside the door graph, so company-os
// (layer 2) reaching the assistant (layer 3) door is not a layer violation.
//
// The server is stateless: use-chat-session.ts holds the Anthropic messages
// array (opaque JSON echoed from the route's `done` event) plus render-friendly
// display items, both persisted to sessionStorage so a reload keeps the chat.

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatPanelBody } from "./ChatPanel";
import type { LoadedConversation } from "./ConversationHistory";
import type { ChatWidgetProps } from "./chat-widget-types";
import { useChatSession } from "./use-chat-session";

export function ChatWidget(props: ChatWidgetProps) {
  const { endpoint, storageKey, approvals } = props;
  const supportsApprovals = Boolean(approvals);
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { items, conversationId, pending, runTurn, decide, loadConversation, reset } =
    useChatSession({ endpoint, storageKey, supportsApprovals });

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [items, open]);

  const hasPendingApproval =
    supportsApprovals && items.some((it) => it.kind === "approval" && it.status === "pending");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending || hasPendingApproval) return;
    setInput("");
    runTurn(text);
  }

  // Selecting a saved conversation hydrates it and returns to the chat view.
  const onSelect = useCallback(
    (conv: LoadedConversation) => {
      loadConversation(conv);
      setShowHistory(false);
    },
    [loadConversation],
  );

  const onNewChat = useCallback(() => {
    reset();
    setShowHistory(false);
  }, [reset]);

  return (
    <>
      <button
        type="button"
        className="admin-chat-fab"
        aria-label={props.fabLabel}
        onClick={() => setOpen(true)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M21 12c0 4.418-4.03 8-9 8-1.02 0-2-.15-2.91-.43L4 21l1.02-3.4C3.77 16.2 3 14.19 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M8.5 12h.01M12 12h.01M15.5 12h.01"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        <ChatPanelBody
          props={props}
          items={items}
          conversationId={conversationId}
          showHistory={showHistory}
          onToggleHistory={() => setShowHistory((v) => !v)}
          input={input}
          setInput={setInput}
          pending={pending}
          hasPendingApproval={hasPendingApproval}
          onClose={() => setOpen(false)}
          onNewChat={onNewChat}
          onSubmit={onSubmit}
          onSelect={onSelect}
          onDecide={decide}
          scrollRef={scrollRef}
          inputRef={inputRef}
        />
      )}
    </>
  );
}
