"use client";

import { useState } from "react";
import { Icon } from "@/kernel/ui/Icon";
import type { MayProp } from "@/kernel/identity/may-prop";
import { renameSpark } from "../own-spark-actions";
import { OWN_SPARK_ATOM, SPARK_TITLE_MAX as MAX } from "../own-spark";

// A spark's line, and for its author the way to fix it (TH.4.6). Only a spark
// without a plan: a planned spark's title is edited with its plan
// (EditablePlan). One line, as the composer asks for: a newline becomes a space.

export function SparkTitle({ ideaId, title, canRename: owner, may }: { ideaId: string; title: string; canRename: boolean; may: MayProp }) {
  // Hidden unless the viewer holds the atom the action guards (ADR 0014); the
  // action still refuses anyone but the author.
  const canRename = owner && may[OWN_SPARK_ATOM] === true;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // After a save: null before one, else what to say (a note when its card kept the old title).
  const [saved, setSaved] = useState<{ note: string | null } | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await renameSpark(ideaId, draft);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setEditing(false);
    setSaved({ note: r.note ?? null });
  }

  if (editing) {
    return (
      <div className="sparks-title-edit">
        <label className="sparks-sr" htmlFor="spark-title-edit">
          Your spark&apos;s line
        </label>
        <textarea
          id="spark-title-edit"
          rows={3}
          maxLength={MAX}
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value.replace(/\n/g, " "))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <div className="sparks-title-edit-foot">
          <span>{MAX - draft.length} characters left · one line is a whole spark</span>
          <div>
            <button type="button" className="sparks-answer-text" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="sparks-btn-dark" onClick={() => void save()} disabled={busy}>
              {busy ? "Saving…" : "Save title"}
            </button>
          </div>
        </div>
        {error && (
          <div role="alert" className="sparks-deck-error">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="sparks-title-row">
        <h1 id="spark-title" className="sparks-detail-title">
          {title}
        </h1>
        {canRename && (
          <button
            type="button"
            className="sparks-pill sparks-edit"
            onClick={() => {
              setDraft(title);
              setSaved(null);
              setEditing(true);
            }}
          >
            <Icon name="pencil" />
            Edit title
          </button>
        )}
      </div>
      {saved && !saved.note && (
        <span className="sparks-saved" role="status">
          <Icon name="check" />
          Saved. The sky, All sparks and its card read the new title.
        </span>
      )}
      {saved?.note && (
        <p className="sparks-note" role="status">
          <Icon name="alert" />
          <span>{saved.note}</span>
        </p>
      )}
    </>
  );
}
