"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateIdeaPlan } from "../actions";

// Owner-only editing of a generated product plan. The server renders the
// sanitized HTML; this component swaps it for the raw markdown in a textarea
// and saves through updateIdeaPlan, which re-checks ownership server-side.
// After a save the page is refreshed so the markdown re-renders through the
// same sanitizing pipeline, never client-side.

export function EditablePlan(props: {
  ideaId: string;
  title: string;
  markdown: string;
  html: string;
  sub: string;
  // What the document is called: a build idea's "plan", a learning's
  // "write-up" (ID.2: learnings became editable by their author too).
  noun?: "plan" | "write-up";
  // Inside the spark page's plan tab (W.187) the tab names the document and
  // the surrounding card frames it, so the plan draws no card or heading of its own.
  bare?: boolean;
}) {
  const noun = props.noun ?? "plan";
  const frame = props.bare ? "" : "admin-card u-p-5 u-mb-5";
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(props.title);
  const [draft, setDraft] = useState(props.markdown);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setDraftTitle(props.title);
    setDraft(props.markdown);
    setError(null);
    setEditing(true);
  }

  async function save() {
    setError(null);
    setSaving(true);
    const r = await updateIdeaPlan(props.ideaId, { title: draftTitle, plan: draft });
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className={frame}>
        <div className="u-row u-wrap u-between">
          {!props.bare && <h2 className="admin-card-title">{noun === "plan" ? "Your product plan" : "Your write-up"}</h2>}
          <button type="button" className="admin-btn admin-btn--sm" onClick={startEditing}>
            Edit {noun}
          </button>
        </div>
        <p className="admin-page-sub u-mt-0">{props.sub}</p>
        <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: props.html }} />
      </div>
    );
  }

  return (
    <div className={frame}>
      <h2 className="admin-card-title">Edit your {noun}</h2>
      <p className="admin-page-sub u-mt-0">
        Markdown works here (headings, lists, bold). {noun === "plan"
          ? props.bare
            ? "Your original 5D answers, in the other tab, stay untouched."
            : "Your original 5D answers below stay untouched."
          : "What you first shared below stays untouched."}
      </p>
      <div className="admin-field">
        <label className="admin-label" htmlFor="plan-title">Idea title</label>
        <input
          id="plan-title"
          className="admin-input"
          value={draftTitle}
          maxLength={200}
          onChange={(e) => setDraftTitle(e.target.value)}
        />
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor="plan-body">{noun === "plan" ? "Plan" : "Write-up"}</label>
        <textarea
          id="plan-body"
          className="admin-textarea"
          rows={18}
          value={draft}
          maxLength={20000}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
        />
      </div>
      {error && <div className="admin-alert admin-alert--err u-mt-3">{error}</div>}
      <div className="admin-form-actions u-mt-4">
        <button type="button" className="admin-btn" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : `Save ${noun}`}
        </button>
      </div>
    </div>
  );
}
