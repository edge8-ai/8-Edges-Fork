"use client";

// Everything the open assistant panel renders, as a pure function of state.
// Split out of the stateful ChatWidget so entities/assistant/ui/
// chat-widget-dom.test.tsx can render each state through react-dom/server and
// diff the markup against the pre-refactor JSX of the two widgets this
// component replaced. ChatWidget is its only production caller.

import type { ReactNode, RefObject } from "react";
import { BotText } from "@/kernel/ui/BotText";
import { ConversationHistory, type LoadedConversation } from "./ConversationHistory";
import type { ChatDisplayItem, ChatWidgetProps } from "./chat-widget-types";

// The caller's approval card arrives as a bare node; a Fragment carries the
// list key without cloning it.
function Keyed({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function ChatPanelBody({
  props,
  items,
  conversationId,
  showHistory,
  onToggleHistory,
  input,
  setInput,
  pending,
  hasPendingApproval,
  onClose,
  onNewChat,
  onSubmit,
  onSelect,
  onDecide,
  scrollRef,
  inputRef,
}: {
  props: ChatWidgetProps;
  items: ChatDisplayItem[];
  conversationId: string | null;
  showHistory: boolean;
  onToggleHistory: () => void;
  input: string;
  setInput: (v: string) => void;
  pending: boolean;
  hasPendingApproval: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onSelect: (conv: LoadedConversation) => void;
  onDecide: (id: string, approved: boolean) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    // Both children are position:fixed and carry their own z-index, so this
    // wrapper only groups them into one returned element.
    <div>
      <button type="button" aria-label="Close" className="admin-drawer-backdrop" onClick={onClose} />
      <aside className="admin-drawer admin-chat-panel" role="dialog" aria-label={props.panelLabel}>
        <div className="admin-drawer-head">
          <div>
            <div className="admin-drawer-eyebrow brand-label">{props.eyebrow}</div>
            <h2 className="admin-drawer-title">Assistant</h2>
          </div>
          <div className="admin-chat-head-actions">
            <button
              type="button"
              className={`admin-chat-history-btn${showHistory ? " admin-chat-history-btn--active" : ""}`}
              aria-pressed={showHistory}
              onClick={onToggleHistory}
            >
              {showHistory ? "Back" : "History"}
            </button>
            {(items.length > 0 || conversationId) && (
              <button type="button" className="admin-chat-newchat" onClick={onNewChat}>
                New chat
              </button>
            )}
            <button type="button" className="admin-drawer-close" aria-label="Close" onClick={onClose}>
              ×
            </button>
          </div>
        </div>

        {showHistory ? (
          <ConversationHistory
            surface={props.surface}
            activeId={conversationId}
            onSelect={onSelect}
            emptyHint={props.historyEmptyHint}
          />
        ) : (
          <>
            <div className="admin-chat-msgs" ref={scrollRef}>
              {items.length === 0 && <div className="admin-chat-empty">{props.emptyState}</div>}

              {items.map((item, i) => {
                if (item.kind === "user") {
                  return (
                    <div key={i} className="admin-chat-msg admin-chat-msg--user">
                      {item.text}
                    </div>
                  );
                }
                if (item.kind === "bot") {
                  return (
                    <div key={i} className="admin-chat-msg admin-chat-msg--bot">
                      <BotText text={item.text} />
                    </div>
                  );
                }
                if (item.kind === "tool") {
                  return (
                    <div key={i} className="admin-chat-toolchip" title={item.detail}>
                      {props.toolChipLabel(item.name)}
                    </div>
                  );
                }
                if (item.kind === "approval") {
                  // A surface without approvals never receives one; if a stale
                  // sessionStorage blob still holds one, drop it rather than
                  // render a card the surface has no way to act on.
                  const card = props.approvals?.render({ item, disabled: pending, onDecide });
                  return card ? <Keyed key={i}>{card}</Keyed> : null;
                }
                return (
                  <div key={i} className="admin-chat-msg admin-chat-msg--error">
                    {item.text}
                  </div>
                );
              })}

              {pending && <div className="admin-chat-typing">Thinking…</div>}
            </div>

            <form className="admin-chat-composer" onSubmit={onSubmit}>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  hasPendingApproval && props.approvals
                    ? props.approvals.pendingPlaceholder
                    : props.placeholder
                }
                disabled={pending || hasPendingApproval}
                aria-label={props.inputLabel}
              />
              <button
                type="submit"
                className="admin-chat-send"
                disabled={pending || hasPendingApproval || !input.trim()}
              >
                Send
              </button>
            </form>
          </>
        )}
      </aside>
    </div>
  );
}
