"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { VALUE_DESC_MAX, VALUE_TITLE_MAX } from "@/entities/org/lib/core-values";
import type { ValueDraft } from "./actions";

// The edit form that opens inside a value's tile (or the Add tile). It takes
// focus when it opens; ⌘/Ctrl+Enter saves and Escape cancels, and the editor
// puts focus back on the button that opened it. The limits match the server's.

type Props = {
  initial: ValueDraft;
  isNew: boolean;
  onCancel: () => void;
  onSave: (draft: ValueDraft) => Promise<{ ok: true } | { ok: false; error: string }>;
};

function Counter({ len, max, id }: { len: number; max: number; id: string }) {
  return (
    <span id={id} className={`admin-cv-count${len > max - 15 ? " is-near" : ""}`}>
      {len}/{max}
    </span>
  );
}

export function ValueForm({ initial, isNew, onCancel, onSave }: Props) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const titleMissing = touched && !draft.title.trim();
  const descMissing = touched && !draft.description.trim();

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    setTouched(true);
    if (!draft.title.trim() || !draft.description.trim()) return;
    setSaving(true);
    const res = await onSave(draft);
    setSaving(false);
    if (!res.ok) setError(res.error);
  }

  function onKey(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <form className="admin-cv-form" onSubmit={submit} onKeyDown={onKey} aria-label={isNew ? "Add a value" : `Edit ${initial.title}`}>
      <div className="admin-cv-field">
        <div className="admin-cv-field-top">
          <label htmlFor="admin-cv-title">Value</label>
          <Counter len={draft.title.length} max={VALUE_TITLE_MAX} id="admin-cv-title-count" />
        </div>
        <input
          id="admin-cv-title"
          className="admin-cv-input"
          // The form opens because the user asked to edit, so focus belongs in it.
          autoFocus
          maxLength={VALUE_TITLE_MAX}
          value={draft.title}
          placeholder="A few words, like Act With Ownership"
          aria-invalid={titleMissing || undefined}
          aria-describedby="admin-cv-title-count"
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
        {titleMissing && <span className="admin-cv-field-err">A value needs a title.</span>}
      </div>
      <div className="admin-cv-field">
        <div className="admin-cv-field-top">
          <label htmlFor="admin-cv-desc">What it means</label>
          <Counter len={draft.description.length} max={VALUE_DESC_MAX} id="admin-cv-desc-count" />
        </div>
        <textarea
          id="admin-cv-desc"
          className="admin-cv-input"
          rows={3}
          maxLength={VALUE_DESC_MAX}
          value={draft.description}
          placeholder="One or two sentences on what it looks like in the work."
          aria-invalid={descMissing || undefined}
          aria-describedby="admin-cv-desc-count"
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
        {descMissing && <span className="admin-cv-field-err">A value needs a description.</span>}
      </div>
      {error && (
        <p className="admin-cv-field-err" role="alert">
          {error}
        </p>
      )}
      <div className="admin-cv-form-actions">
        <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
          {saving ? "Saving…" : isNew ? "Add value" : "Save"}
        </button>
        <button type="button" className="admin-btn" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <span className="admin-cv-kbd">⌘↵ saves · Esc cancels</span>
      </div>
    </form>
  );
}
