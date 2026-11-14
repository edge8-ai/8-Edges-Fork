"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { updateStrategy } from "../actions";

// The edit shell around the read-only StrategyView: an admin toggles into a
// raw title + body_md editor (the same fields /admin/edges/goals edits), saves,
// and drops back to the designed preview. The body is authored as `##` sections
// (Overview, Ambition, Purpose, Value Proposition, Themes, Business Lines); the
// view designs the ones it recognizes and renders the rest as prose.
export function StrategyEditor({
  id,
  initialTitle,
  initialBody,
  children,
}: {
  id: string;
  initialTitle: string;
  initialBody: string;
  children: ReactNode; // the read-only StrategyView
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    startTransition(async () => {
      const res = await updateStrategy(id, { title, body_md: body });
      if (res.ok) {
        setBanner({ tone: "ok", text: "Strategy saved. The team page is updated." });
        setEditing(false);
        router.refresh();
      } else {
        setBanner({ tone: "err", text: res.error });
      }
    });
  }

  function cancel() {
    setTitle(initialTitle);
    setBody(initialBody);
    setEditing(false);
    setBanner(null);
  }

  return (
    <>
      {banner && <div className={`admin-alert admin-alert--${banner.tone === "ok" ? "ok" : "err"}`}>{banner.text}</div>}

      <div className="admin-form-actions u-mb-4">
        {editing ? (
          <button className="admin-btn" onClick={cancel} disabled={pending}>
            Cancel
          </button>
        ) : (
          <button className="admin-btn admin-btn--primary" onClick={() => setEditing(true)}>
            Edit strategy
          </button>
        )}
      </div>

      {editing ? (
        <form className="admin-form" onSubmit={save}>
          <div className="admin-field">
            <label className="admin-label" htmlFor="strat-title">
              The aspirational line
            </label>
            <input
              id="strat-title"
              className="admin-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={300}
              required
            />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="strat-body">
              Strategy one-pager (markdown, `##` sections)
            </label>
            <textarea
              id="strat-body"
              rows={22}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="admin-textarea admin-mono"
            />
          </div>
          <div className="admin-form-actions">
            <button type="submit" className="admin-btn admin-btn--primary" disabled={pending}>
              {pending ? "Saving…" : "Save strategy"}
            </button>
            <button type="button" className="admin-btn" onClick={cancel} disabled={pending}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        children
      )}
    </>
  );
}
