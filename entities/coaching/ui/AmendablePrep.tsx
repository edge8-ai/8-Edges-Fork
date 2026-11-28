"use client";

import { useState, useTransition } from "react";
import { saveMyPrepEdits } from "@/entities/coaching/lib/premeeting-actions";
import { applyMemberEdits, MAX_ADDED, parsePrepBullets, type PrepEdits } from "@/entities/coaching/lib/prep-edits";

// The shared prep, amendable by the member before the 1-1 (K.21). The coach's
// bullets render as a list the member can strike or add to; the strikes and
// additions are stored beside the prep and shown to the coach marked as the
// member's, and the coach's own text is never rewritten. Orosz: the surprise
// is the damage, so the member gets to shape the agenda before the room.

export function AmendablePrep({
  markdown,
  edits: initial,
  coachName,
}: {
  // The coach's shared prep, raw markdown; null until the cycle writes it.
  markdown: string | null;
  edits: PrepEdits;
  coachName: string | null;
}) {
  const [edits, setEdits] = useState<PrepEdits>(initial);
  const [added, setAdded] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const bullets = parsePrepBullets(markdown);
  if (!markdown) {
    return (
      <div className="admin-cell-muted">
        {coachName ?? "Your coach"} has not written their half yet. It arrives a few days before.
      </div>
    );
  }
  const lines = applyMemberEdits(bullets, edits);

  const toggleStrike = (text: string) =>
    setEdits((e) => ({
      ...e,
      struck: e.struck.includes(text) ? e.struck.filter((t) => t !== text) : [...e.struck, text],
    }));
  const removeAdded = (text: string) => setEdits((e) => ({ ...e, added: e.added.filter((t) => t !== text) }));
  const addLine = () => {
    const text = added.trim();
    if (!text) return;
    setEdits((e) => ({ ...e, added: [...e.added, text] }));
    setAdded("");
  };
  const save = () => {
    setToast(null);
    setError(null);
    startTransition(async () => {
      const res = await saveMyPrepEdits(edits);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setToast("Saved. Your coach sees your changes, marked as yours.");
    });
  };

  return (
    <div>
      <ul className="admin-mycoach-premeeting-agenda coach-amend-list">
        {lines.map((l) => (
          <li key={`${l.mine ? "m" : "c"}-${l.text}`} className={l.struck ? "coach-amend-struck" : undefined}>
            {l.struck ? <s>{l.text}</s> : l.text}
            {l.mine && <span className="admin-badge coach-amend-mine">yours</span>}{" "}
            {l.mine ? (
              <button type="button" className="admin-link-btn" onClick={() => removeAdded(l.text)}>
                Remove
              </button>
            ) : (
              <button type="button" className="admin-link-btn" onClick={() => toggleStrike(l.text)}>
                {l.struck ? "Restore" : "Strike"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {edits.added.length < MAX_ADDED && (
        <div className="admin-coach-add-row">
          <input
            className="admin-input"
            placeholder="Add a line to the agenda"
            value={added}
            onChange={(e) => setAdded(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addLine();
            }}
            aria-label="Add a line to the agenda"
          />
          <button type="button" className="admin-btn admin-btn--sm" disabled={!added.trim()} onClick={addLine}>
            Add
          </button>
        </div>
      )}
      <div className="admin-form-actions">
        <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save my changes"}
        </button>
        {toast && <span className="admin-cell-muted">{toast}</span>}
      </div>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
    </div>
  );
}
