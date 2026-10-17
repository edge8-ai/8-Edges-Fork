"use client";

// Conversation state for the assistant chat widget: the transcript, the opaque
// Anthropic messages array, the sessionStorage mirror, and the POST + SSE pump
// that drives both a new user turn and an approval decision. Split out of
// ChatWidget.tsx only because of the 250-line cap; ChatWidget is its one caller.

import { useCallback, useEffect, useState } from "react";
import { sseEvents } from "@/kernel/ui/sse";
import type { ChatDisplayItem, ChatSseEvent, ChatWidgetProps } from "./chat-widget-types";
import type { LoadedConversation } from "./ConversationHistory";

type SavedChat = { items: ChatDisplayItem[]; messages: unknown[]; conversationId: string | null };

// Restore persisted chat from sessionStorage. Runs as a lazy useState
// initializer (client-only via the window guard). Safe against hydration
// mismatch because the panel is closed on first render, so restored content is
// never in the server-rendered HTML.
function loadSaved(storageKey: string): SavedChat {
  if (typeof window === "undefined") return { items: [], messages: [], conversationId: null };
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return { items: [], messages: [], conversationId: null };
    const saved = JSON.parse(raw) as {
      items?: ChatDisplayItem[];
      messages?: unknown[];
      conversationId?: string | null;
    };
    const items = (saved.items ?? []).map((it) =>
      it.kind === "bot" ? { ...it, streaming: false } : it,
    );
    return { items, messages: saved.messages ?? [], conversationId: saved.conversationId ?? null };
  } catch {
    return { items: [], messages: [], conversationId: null };
  }
}

export function useChatSession({
  endpoint,
  storageKey,
  supportsApprovals,
}: Pick<ChatWidgetProps, "endpoint" | "storageKey"> & { supportsApprovals: boolean }) {
  // One read of sessionStorage seeds all three pieces of state. Three separate
  // loadSaved() calls would parse the same blob three times and could disagree
  // if another tab wrote between them.
  const [saved] = useState(() => loadSaved(storageKey));
  const [items, setItems] = useState<ChatDisplayItem[]>(saved.items);
  const [messages, setMessages] = useState<unknown[]>(saved.messages);
  const [conversationId, setConversationId] = useState<string | null>(saved.conversationId);
  const [pending, setPending] = useState(false);

  // Persist the ACTIVE conversation so a full page reload restores it instantly
  // (the DB is the source of truth for the list + cross-device loads).
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ items, messages, conversationId }));
    } catch {
      // storage full: chat still works, just won't survive a reload
    }
  }, [storageKey, items, messages, conversationId]);

  // Shared POST + SSE pump for both new user turns and approval decisions.
  // Returns whether the stream completed (reached `done`).
  const runRequest = useCallback(
    async (payload: {
      messages: unknown[];
      decision?: { toolUseId: string; approved: boolean };
      displayItems: ChatDisplayItem[];
    }): Promise<boolean> => {
      setPending(true);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, conversationId }),
        });
        if (!res.ok || !res.body) {
          const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
          setItems((prev) => [
            ...prev,
            { kind: "error", text: errBody?.error ?? `Request failed (${res.status})` },
          ]);
          return false;
        }

        let gotDone = false;

        const handle = (event: ChatSseEvent) => {
          if (event.type === "text") {
            setItems((prev) => {
              const last = prev[prev.length - 1];
              if (last?.kind === "bot" && last.streaming) {
                return [...prev.slice(0, -1), { ...last, text: last.text + event.text }];
              }
              return [...prev, { kind: "bot", text: event.text, streaming: true }];
            });
          } else if (event.type === "tool") {
            setItems((prev) => [
              ...prev.map((it) => (it.kind === "bot" ? { ...it, streaming: false } : it)),
              { kind: "tool", detail: event.detail, name: event.name },
            ]);
          } else if (event.type === "approval") {
            // A surface with no approval affordances cannot act on a card, so
            // it drops the frame rather than rendering a dead one.
            if (!supportsApprovals) return;
            setItems((prev) => [
              ...prev.map((it) => (it.kind === "bot" ? { ...it, streaming: false } : it)),
              {
                kind: "approval",
                id: event.id,
                name: event.name,
                input: event.input,
                status: "pending",
              },
            ]);
          } else if (event.type === "error") {
            setItems((prev) => [...prev, { kind: "error", text: event.error }]);
          } else if (event.type === "done") {
            gotDone = true;
            setMessages(event.messages);
            if (event.conversationId) setConversationId(event.conversationId);
          }
        };

        for await (const frame of sseEvents(res.body)) {
          try {
            handle(JSON.parse(frame.data) as ChatSseEvent);
          } catch {
            // skip malformed frame
          }
        }
        if (!gotDone) {
          setItems((prev) => [...prev, { kind: "error", text: "Response interrupted. Try again." }]);
        }
        return gotDone;
      } catch {
        setItems((prev) => [
          ...prev,
          { kind: "error", text: "Could not reach the assistant. Try again." },
        ]);
        return false;
      } finally {
        setItems((prev) => prev.map((it) => (it.kind === "bot" ? { ...it, streaming: false } : it)));
        setPending(false);
      }
    },
    [endpoint, conversationId, supportsApprovals],
  );

  const runTurn = useCallback(
    (text: string) => {
      const nextItems: ChatDisplayItem[] = [...items, { kind: "user", text }];
      setItems(nextItems);
      void runRequest({
        messages: [...messages, { role: "user", content: text }],
        displayItems: nextItems,
      });
    },
    [items, messages, runRequest],
  );

  // Approve/Cancel a pending write or email. Optimistically resolve the card;
  // if the request never completes, put it back so the action can be retried.
  const decide = useCallback(
    async (id: string, approved: boolean) => {
      const status = approved ? ("approved" as const) : ("declined" as const);
      const nextItems = items.map((it) =>
        it.kind === "approval" && it.id === id ? { ...it, status } : it,
      );
      setItems(nextItems);
      const ok = await runRequest({
        messages,
        decision: { toolUseId: id, approved },
        displayItems: nextItems,
      });
      if (!ok) {
        setItems((prev) =>
          prev.map((it) =>
            it.kind === "approval" && it.id === id ? { ...it, status: "pending" } : it,
          ),
        );
      }
    },
    [items, messages, runRequest],
  );

  // Open a saved conversation from the history list: hydrate the transcript +
  // display items (the DB is the source of truth).
  const loadConversation = useCallback((conv: LoadedConversation) => {
    setItems(
      (conv.display_items as ChatDisplayItem[]).map((it) =>
        it.kind === "bot" ? { ...it, streaming: false } : it,
      ),
    );
    setMessages(conv.messages);
    setConversationId(conv.id);
  }, []);

  const reset = useCallback(() => {
    setItems([]);
    setMessages([]);
    setConversationId(null);
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey]);

  return { items, conversationId, pending, runTurn, decide, loadConversation, reset };
}
