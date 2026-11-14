"use client";

import { useState, useTransition } from "react";
import { addMyQuickNote, archiveMyQuickNote } from "@/entities/coaching/lib/my-actions";
import { formatDate } from "@/kernel/ui/format";

// "Something worth remembering" (K.19): one field at the top of History for the
// thing the member noticed today, which the brag document reads back and the
// next 1-1 form offers as a draft. It sits here, on History, because that is the
// tab about what has happened; nothing about it is a count or a target.

export type MemberNoteView = { id: string; createdAt: string; body: string };

export function WorthRemembering({ notes }: { notes: MemberNoteView[] }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const add = () => {
    setError(null);
    startTransition(async () => {
      const res = await addMyQuickNote(body);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBody("");
    });
  };

  const archive = (id: string) => {
    setError(null);
    startTransition(async () => {
      const res = await archiveMyQuickNote(id);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">Something worth remembering</div>
      <div className="admin-hint">
        A win, a moment, a thing that landed. One line now saves you trying to remember it before your next 1-1 — it
        joins your brag document and is offered there as a draft.
      </div>
      <div className="admin-coach-add-row">
        <input
          className="admin-input"
          value={body}
          placeholder="The client said the dashboard finally clicked."
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && body.trim()) add();
          }}
        />
        <button type="button" className="admin-btn" disabled={pending} onClick={add}>
          {pending ? "Saving…" : "Add"}
        </button>
      </div>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      {notes.length === 0 ? (
        <div className="admin-empty">Nothing yet. The first thing you notice this week can go here.</div>
      ) : (
        <ul className="admin-mycoach-premeeting-agenda">
          {notes.map((n) => (
            <li key={n.id}>
              <strong>{formatDate(n.createdAt)}</strong> {n.body}{" "}
              <button type="button" className="admin-link-btn" disabled={pending} onClick={() => archive(n.id)}>
                Archive
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
