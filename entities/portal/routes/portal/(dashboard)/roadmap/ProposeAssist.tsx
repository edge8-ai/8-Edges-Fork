"use client";

import { useRef, useState } from "react";
import type { RoadmapDraft } from "@/entities/portal/api/portal/roadmap-assist/route";

// "Help me write this" (PR 4): a compact Q&A that drafts the propose form.
// Two or three short questions, then the draft lands in the form fields for
// the client to review and send. Nothing is submitted from here.
//
// No `router.refresh()` after the fetch, deliberately: `/api/portal/roadmap-assist`
// only drafts text, it writes no row, so there is nothing on the server for the
// page to re-read. The row appears when the propose form itself is submitted,
// and that path is a server action, whose `revalidatePath` does reach the
// browser's Client Router Cache.

type ChatMessage = { role: "user" | "assistant"; content: string };

export function ProposeAssist({ onDraft }: { onDraft: (draft: RoadmapDraft) => void }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send() {
    const content = input.trim();
    if (!content || busy) return;
    setError(null);
    setBusy(true);
    setInput("");
    const next: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    try {
      const res = await fetch("/api/portal/roadmap-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = (await res.json()) as {
        reply?: string;
        draft?: RoadmapDraft | null;
        messages?: ChatMessage[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "The assistant hit a problem. Please try again.");
        setBusy(false);
        return;
      }
      if (data.draft) {
        onDraft(data.draft);
        setOpen(false);
        setMessages([]);
      } else {
        setMessages([...next, { role: "assistant", content: data.reply ?? "" }]);
        queueMicrotask(() => scrollRef.current?.scrollTo({ top: 999999 }));
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        className="admin-backlog-link u-mb-2"
        onClick={() => {
          setOpen(true);
          setMessages([]);
          setError(null);
        }}
      >
        ✨ Help me write this
      </button>
    );
  }

  return (
    <div className="admin-assist">
      <div className="u-row u-mb-2">
        <strong className="u-sm u-grow">Draft assistant</strong>
        <button type="button" className="admin-backlog-link" onClick={() => setOpen(false)}>Close</button>
      </div>
      {messages.length === 0 && (
        <p className="u-sm u-ink-2 u-m-0 u-mb-2">
          Tell me the problem or idea in a sentence. I&apos;ll ask a question or two, then fill in the form for you to review.
        </p>
      )}
      {messages.length > 0 && (
        <div ref={scrollRef} className="u-scroll-180 u-stack u-gap-2 u-mb-2">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`admin-assist-msg${m.role === "user" ? " admin-assist-msg--me" : ""}`}
            >
              {m.content}
            </div>
          ))}
          {busy && <div className="u-sm u-ink-2">Thinking…</div>}
        </div>
      )}
      <div className="u-row">
        <input
          className="admin-assist-input u-grow"
          value={input}
          placeholder={messages.length === 0 ? "e.g. our returns process is chaos" : "Your answer…"}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button type="button" className="admin-backlog-btn" disabled={busy || !input.trim()} onClick={() => void send()}>
          Send
        </button>
      </div>
      {error && <div className="admin-backlog-err">{error}</div>}
    </div>
  );
}
