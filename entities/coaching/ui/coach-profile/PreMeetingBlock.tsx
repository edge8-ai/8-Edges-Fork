"use client";

import { useState } from "react";
import type { Checkin } from "@/entities/coaching/lib/data/profile";
import { saveCheckinNote } from "@/entities/coaching/lib/premeeting-actions";
import { type ActionResult } from "./shared";
import { hasEdits, type PrepEdits } from "@/entities/coaching/lib/prep-edits";

// What the member wrote in the ninety seconds before this 1-1, read-only, and
// the coach's one note back (K.15, spec 2.3). The three answers are optional
// for the member, so an empty heading is not a gap: it is the question the
// coach asks in the room instead, which is why every heading renders whether
// or not anything was typed.
const FIELDS = [
  { key: "moved", label: "What moved since last time" },
  { key: "stuck", label: "What is stuck" },
  { key: "talk", label: "What they want to talk about" },
] as const;

export function PreMeetingBlock({
  checkin,
  prepEdits,
  run,
  busy,
}: {
  checkin: Checkin;
  // What the member struck and added on the shared prep (K.21), shown as theirs.
  prepEdits?: PrepEdits;
  run: (label: string, fn: () => Promise<ActionResult>, onOk?: () => void) => void;
  busy: boolean;
}) {
  const [note, setNote] = useState(checkin.coachNote ?? "");

  return (
    <div className="admin-coach-block">
      <div className="admin-coach-block-head">
        <span className="admin-eyebrow">Before this 1-1, in their words</span>
      </div>
      {FIELDS.map((f) => {
        const value = checkin[f.key];
        return (
          <div key={f.key} className="admin-mycoach-premeeting-answer">
            <strong>{f.label}</strong>
            {value?.trim() ? (
              <div className="admin-mycoach-premeeting-text">{value}</div>
            ) : (
              <div className="admin-cell-muted">Nothing written. Ask it in the room.</div>
            )}
          </div>
        );
      })}

      {prepEdits && hasEdits(prepEdits) && (
        <div className="admin-mycoach-premeeting-answer">
          <strong>They amended the prep</strong>
          {prepEdits.struck.length > 0 && (
            <div className="admin-cell-muted">
              Struck: {prepEdits.struck.map((t) => <s key={t}>{t}</s>).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, "; ", el] : [el]), [])}
            </div>
          )}
          {prepEdits.added.length > 0 && (
            <ul className="admin-mycoach-premeeting-agenda">
              {prepEdits.added.map((t) => (
                <li key={t}>{t} <span className="admin-badge">theirs</span></li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="admin-coach-block-head">
        <span className="admin-eyebrow">Your note back</span>
      </div>
      <div className="admin-hint">They see this on their page as soon as you save it.</div>
      <textarea
        className="admin-input"
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="One line back, optional."
      />
      <div className="admin-form-actions">
        <button
          className="admin-btn admin-btn--sm"
          disabled={busy}
          onClick={() => run("Note", () => saveCheckinNote(checkin.id, note))}
        >
          Save note
        </button>
      </div>
    </div>
  );
}
