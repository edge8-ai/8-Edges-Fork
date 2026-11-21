"use client";

import { useState, useTransition } from "react";
import type { GoalComment } from "@/entities/coaching/lib/types";
import { commentOnGoal } from "@/entities/coaching/lib/goal-actions";

// The discussion thread on a FAST goal. Goals are transparent to the whole
// team and so are their comments; any team member can add one. Rendered on
// the coach page, /team/my-coaching, and directory profiles.
export function GoalComments({ goalId, comments }: { goalId: string; comments: GoalComment[] }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, startTransition] = useTransition();

  return (
    <div className="admin-goal-comments">
      <button className="admin-goal-comments-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {/* The label says what is there AND what to do with it (K.62): a bare
            count reads as a statistic and a bare "Comment" hides the thread
            that already exists. */}
        {comments.length === 0
          ? "No comments yet · add one"
          : `${comments.length} comment${comments.length === 1 ? "" : "s"} · add one`}{" "}
        {open ? "▾" : "▸"}
      </button>
      {open && (
        <div className="admin-goal-comments-body">
          {comments.map((c) => (
            <div key={c.id} className="admin-goal-comment">
              <span className="admin-goal-comment-author">{c.authorName}</span>
              <span className="admin-cell-muted admin-goal-comment-date">
                {new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </span>
              <div className="admin-goal-comment-text">{c.body}</div>
            </div>
          ))}
          {error && <div className="admin-alert admin-alert--err">{error}</div>}
          <div className="admin-coach-add-row">
            <input
              className="admin-input"
              placeholder="Add a comment…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={2000}
            />
            <button
              className="admin-btn admin-btn--sm"
              disabled={busy || !body.trim()}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const res = await commentOnGoal(goalId, body);
                  if (!res.ok) setError(res.error);
                  else setBody("");
                });
              }}
            >
              Post
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
