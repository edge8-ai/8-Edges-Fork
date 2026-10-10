"use client";

import { useEffect, useState } from "react";
import { PLAN_MAX } from "@/entities/coaching/lib/commitment-plan";

// "When will you do it?" on a commitment (L.1).
//
// One optional sentence naming the moment the work happens — an implementation
// intention, which the evidence puts at roughly two to three times the
// follow-through of the goal alone. The card already carries a due date; this
// is the different, quieter fact that the due date cannot express.
//
// Three deliberate choices about how it looks:
//
// - Written, it is ITALIC and unlabelled-by-a-noun, because it is the person's
//   own speech about their own work, not a field the system filled in.
// - Empty, it is a placeholder and nothing else. A prompt with a heading and a
//   hint would make an optional line feel owed.
// - Nothing about it ever turns amber or red. There is no "overdue plan": the
//   day passing changes nothing here, which is the whole point of the feature.

export function CommitmentPlan({
  plan,
  canEdit,
  busy,
  onSave,
}: {
  plan: string | null;
  /** Only the commitment's owner plans it; everyone else reads it. */
  canEdit: boolean;
  busy: boolean;
  onSave: (plan: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(plan ?? "");

  // The server is the tiebreaker, as everywhere else on this card: a refresh
  // replaces what is shown unless the viewer is mid-edit.
  useEffect(() => {
    if (!editing) setDraft(plan ?? "");
  }, [plan, editing]);

  if (!canEdit && !plan) return null;
  if (!canEdit) return <p className="admin-cboard-plan is-set">{plan}</p>;

  const commit = () => {
    setEditing(false);
    if ((plan ?? "") !== draft.trim()) onSave(draft);
  };

  if (editing) {
    return (
      <input
        className="admin-input admin-cboard-plan-input"
        value={draft}
        maxLength={PLAN_MAX}
        disabled={busy}
        autoFocus
        placeholder="When will you do it?"
        aria-label="When will you do it?"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(plan ?? "");
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={`admin-cboard-plan${plan ? " is-set" : " is-empty"}`}
      disabled={busy}
      onClick={() => setEditing(true)}
    >
      {plan ?? "When will you do it?"}
    </button>
  );
}
