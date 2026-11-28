"use client";

import { useState, useTransition } from "react";
import { writeMyGoalLetter } from "@/entities/coaching/lib/my-actions";
import { LETTER_MAX, sealedFor } from "@/entities/coaching/lib/quarter-letter";

// Writing the letter to your end-of-quarter self (L.10).
//
// It sits on the goal, because the moment you set a goal is the only moment you
// genuinely have something to say to the person who will have lived the
// quarter. Asked later it becomes a chore; asked here it is the same breath.
//
// Once written, this shows THAT it exists and when — never the words. Showing
// them back would spend the whole thing: the value is entirely in the gap
// between writing and reading, and a member who can re-read it any afternoon
// has a note, not a letter.
//
// It is the one thing on this page with no productivity argument behind it.

export function GoalLetter({
  goalId,
  hasLetter,
  sealedOn,
  todayISO,
}: {
  goalId: string;
  // Whether one exists — deliberately NOT the letter itself. This component
  // can say "you wrote one" and cannot show it, which is the seal.
  hasLetter: boolean;
  sealedOn: string | null;
  todayISO: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (hasLetter && !open) {
    return (
      <p className="coach-letter-sealed">
        ✉ Your letter is sealed until this quarter&apos;s review
        {sealedFor(sealedOn, todayISO) ? ` — written ${sealedFor(sealedOn, todayISO)}` : ""}.{" "}
        <button type="button" className="admin-link-btn" onClick={() => setOpen(true)}>
          Write a different one
        </button>
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" className="admin-link-btn coach-letter-open" onClick={() => setOpen(true)}>
        ✉ Write a letter to your end-of-quarter self
      </button>
    );
  }

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await writeMyGoalLetter(goalId, draft);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDraft("");
      setOpen(false);
    });
  };

  return (
    <div className="coach-letter">
      <label className="admin-label" htmlFor={`letter-${goalId}`}>
        Two sentences to yourself, for the end of the quarter
      </label>
      <div className="admin-hint">
        You will not see this again until this quarter&apos;s review page. That is the point.
      </div>
      <textarea
        id={`letter-${goalId}`}
        className="admin-input"
        rows={3}
        maxLength={LETTER_MAX}
        disabled={busy}
        value={draft}
        placeholder="If I get one thing right this quarter, let it be…"
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="admin-form-actions">
        <button type="button" className="admin-btn" disabled={busy || !draft.trim()} onClick={save}>
          {busy ? "Sealing…" : "Seal it"}
        </button>
        <button type="button" className="admin-btn" disabled={busy} onClick={() => setOpen(false)}>
          Not now
        </button>
      </div>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
    </div>
  );
}
