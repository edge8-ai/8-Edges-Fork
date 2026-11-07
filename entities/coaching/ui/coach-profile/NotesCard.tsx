"use client";

import { useState } from "react";

export function NotesCard({
  title,
  hint,
  initial,
  rendered,
  onSave,
  busy,
}: {
  title: string;
  hint: string;
  initial: string;
  rendered: string | null;
  // onOk runs only when the save landed, so a refused save keeps the editor
  // open on what was typed (K.79).
  onSave: (md: string, onOk: () => void) => void;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [md, setMd] = useState(initial);

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-coach-block-head">
        <div className="admin-card-title">{title}</div>
        <button className="admin-btn admin-btn--sm" onClick={() => setEditing((v) => !v)}>
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>
      <div className="admin-hint">{hint}</div>
      {editing ? (
        <div className="admin-form">
          <textarea className="admin-input" rows={12} value={md} onChange={(e) => setMd(e.target.value)} />
          <div className="admin-form-actions">
            <button
              className="admin-btn admin-btn--primary"
              disabled={busy}
              onClick={() => {
                onSave(md, () => setEditing(false));
              }}
            >
              Save
            </button>
          </div>
        </div>
      ) : rendered ? (
        <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: rendered }} />
      ) : (
        <div className="admin-cell-muted">Nothing here yet.</div>
      )}
    </section>
  );
}
