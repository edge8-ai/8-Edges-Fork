"use client";

import { useState, useTransition } from "react";
import type { TalkingPoint } from "@/entities/coaching/lib/data/profile";
import { addMyTalkingPoint, deleteMyTalkingPoint } from "@/entities/coaching/lib/my-actions";

// The coachee's side of the shared 1-1 agenda: what they want to raise next
// time. The coach sees these before the meeting (and can add their own), and
// they feed the AI prep. Either side can remove any point.

type ActionResult = { ok: true } | { ok: false; error: string };

export function MyTalkingPoints({ talkingPoints }: { talkingPoints: TalkingPoint[] }) {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");

  const run = (fn: () => Promise<ActionResult>, done?: () => void) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
      else done?.();
    });
  };

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">
        Talking points <span className="admin-cell-muted">the agenda for the next 1-1</span>
      </div>
      <div className="admin-hint">
        What you and your coach want to cover next time. Both of you can add to this list, and it feeds the prep, so
        the 1-1 is yours to shape too.
      </div>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}

      {talkingPoints.length === 0 && (
        <div className="admin-empty">Nothing yet. Add what&apos;s on your mind for next time.</div>
      )}
      {talkingPoints.map((t) => (
        <div key={t.id} className="admin-coach-carried-row">
          <span className="admin-coach-carried-title">{t.body}</span>
          <button
            className="admin-link-btn coach-remove"
            disabled={busy}
            onClick={() => run(() => deleteMyTalkingPoint(t.id))}
          >
            Remove
          </button>
        </div>
      ))}

      <div className="admin-coach-add-row">
        <input
          className="admin-input"
          placeholder="Add a talking point for your next 1-1…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && body.trim()) run(() => addMyTalkingPoint(body), () => setBody(""));
          }}
        />
        <button
          className="admin-btn admin-btn--primary"
          disabled={busy || !body.trim()}
          onClick={() => run(() => addMyTalkingPoint(body), () => setBody(""))}
        >
          Add
        </button>
      </div>
    </section>
  );
}
