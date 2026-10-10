"use client";

// Shared conversation-history panel for both assistants (admin + team). It is the
// same feature gated by who logs in, so the list UI + data hook live here once and
// each widget passes its own `surface`. The component only ever deals in
// conversation summaries and opaque loaded transcripts, so it stays agnostic to the
// two widgets' slightly different DisplayItem shapes.

import { useCallback, useEffect, useRef, useState } from "react";
import { timeAgo } from "@/kernel/ui/format";

export type Surface = "admin" | "team";

export type ConversationSummary = {
  id: string;
  title: string;
  last_message_at: string | null;
};

export type LoadedConversation = {
  id: string;
  messages: unknown[];
  display_items: unknown[];
};

// Data hook: list / load / rename / archive for one surface, all hitting the
// owner-scoped /api/assistant/[surface]/conversations route group.
export function useAssistantConversations(surface: Surface) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/assistant/${surface}/conversations`;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(base, { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { conversations?: ConversationSummary[] };
      setConversations(Array.isArray(data.conversations) ? data.conversations : []);
    } catch {
      setError("Could not load your chat history.");
    } finally {
      setLoading(false);
    }
  }, [base]);

  const load = useCallback(
    async (id: string): Promise<LoadedConversation | null> => {
      try {
        const res = await fetch(`${base}/${id}`, { cache: "no-store" });
        if (!res.ok) return null;
        const data = (await res.json()) as { conversation?: LoadedConversation };
        const c = data.conversation;
        if (!c) return null;
        return {
          id: c.id,
          messages: Array.isArray(c.messages) ? c.messages : [],
          display_items: Array.isArray(c.display_items) ? c.display_items : [],
        };
      } catch {
        return null;
      }
    },
    [base],
  );

  const rename = useCallback(
    async (id: string, title: string) => {
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
      try {
        await fetch(`${base}/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
      } catch {
        // optimistic update stands; next refresh reconciles
      }
    },
    [base],
  );

  const remove = useCallback(
    async (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      try {
        await fetch(`${base}/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived: true }),
        });
      } catch {
        // optimistic removal stands; next refresh reconciles
      }
    },
    [base],
  );

  return { conversations, loading, error, refresh, load, rename, remove };
}

export function ConversationHistory({
  surface,
  activeId,
  onSelect,
  emptyHint,
}: {
  surface: Surface;
  activeId: string | null;
  onSelect: (conversation: LoadedConversation) => void;
  emptyHint?: string;
}) {
  const { conversations, loading, error, refresh, load, rename, remove } =
    useAssistantConversations(surface);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);

  const openConversation = useCallback(
    async (id: string) => {
      if (editingId || confirmingId) return;
      setOpeningId(id);
      const conv = await load(id);
      setOpeningId(null);
      if (conv) onSelect(conv);
    },
    [editingId, confirmingId, load, onSelect],
  );

  const startRename = (c: ConversationSummary) => {
    setConfirmingId(null);
    setEditingId(c.id);
    setDraftTitle(c.title);
  };

  const commitRename = (id: string) => {
    const title = draftTitle.replace(/\s+/g, " ").trim();
    if (title) void rename(id, title);
    setEditingId(null);
    setDraftTitle("");
  };

  return (
    <div className="admin-chat-history">
      {loading && conversations.length === 0 ? (
        <div className="admin-chat-history-note">Loading…</div>
      ) : error ? (
        <div className="admin-chat-history-note admin-chat-history-note--error">{error}</div>
      ) : conversations.length === 0 ? (
        <div className="admin-chat-history-note">
          {emptyHint ?? "No saved conversations yet."}
        </div>
      ) : (
        <ul className="admin-chat-history-list">
          {conversations.map((c) => {
            const isEditing = editingId === c.id;
            const isConfirming = confirmingId === c.id;
            return (
              <li
                key={c.id}
                className={`admin-chat-history-row${c.id === activeId ? " admin-chat-history-row--active" : ""}`}
              >
                {isEditing ? (
                  <div className="admin-chat-history-edit">
                    <input
                      ref={editRef}
                      type="text"
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(c.id);
                        if (e.key === "Escape") {
                          setEditingId(null);
                          setDraftTitle("");
                        }
                      }}
                      aria-label="Rename conversation"
                      maxLength={200}
                    />
                    <button type="button" className="admin-chat-history-icon" onClick={() => commitRename(c.id)}>
                      Save
                    </button>
                    <button
                      type="button"
                      className="admin-chat-history-icon"
                      onClick={() => {
                        setEditingId(null);
                        setDraftTitle("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : isConfirming ? (
                  <div className="admin-chat-history-confirm">
                    <span>Delete this chat?</span>
                    <button
                      type="button"
                      className="admin-chat-history-icon admin-chat-history-icon--danger"
                      onClick={() => {
                        void remove(c.id);
                        setConfirmingId(null);
                      }}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className="admin-chat-history-icon"
                      onClick={() => setConfirmingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      className="admin-chat-history-open"
                      onClick={() => openConversation(c.id)}
                      disabled={openingId === c.id}
                    >
                      <span className="admin-chat-history-title">{c.title || "Untitled chat"}</span>
                      <span className="admin-chat-history-time">
                        {openingId === c.id ? "Opening…" : timeAgo(c.last_message_at)}
                      </span>
                    </button>
                    <div className="admin-chat-history-actions">
                      <button
                        type="button"
                        className="admin-chat-history-icon"
                        aria-label="Rename conversation"
                        onClick={() => startRename(c)}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="admin-chat-history-icon admin-chat-history-icon--danger"
                        aria-label="Delete conversation"
                        onClick={() => {
                          setEditingId(null);
                          setConfirmingId(c.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
