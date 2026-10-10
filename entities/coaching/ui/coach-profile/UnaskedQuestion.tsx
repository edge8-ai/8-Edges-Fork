"use client";

import { useState } from "react";
import { unaskedQuestion } from "@/entities/coaching/lib/unasked-question";

// "One question you have never asked them" (L.12).
//
// Every other card on the coach's Next tab is a fact about the member. This is
// the only thing on the page addressed to the COACH, and it looks like it: a
// dashed border, because it is a suggestion rather than a state, and the
// quietest control on a tab that already spends its one filled button.
//
// It measures nothing. There is no count of questions asked, no coverage
// figure, and nothing records whether the coach took it — that is what keeps it
// a prompt to a person rather than a report about them, and the distinction is
// the entire feature.
export function UnaskedQuestion({
  saidBefore,
  onAdd,
  busy,
}: {
  /** Everything this pair has said in past recaps, as one blob to match against. */
  saidBefore: string;
  onAdd: (question: string) => void;
  busy: boolean;
}) {
  const [nth, setNth] = useState(0);
  const pick = unaskedQuestion(saidBefore, nth);

  // Nothing to suggest is a real answer, not an empty state: a pair who have
  // covered the whole library do not need a card telling them so.
  if (!pick) return null;

  return (
    <section className="admin-card admin-coach-section coach-unasked">
      <div className="admin-eyebrow">A question you two have not covered · {pick.group}</div>
      <p className="coach-unasked-q">{pick.question}</p>
      <div className="admin-form-actions">
        <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={() => onAdd(pick.question)}>
          Add to agenda
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--sm"
          disabled={busy}
          onClick={() => setNth((n) => n + 1)}
        >
          Show another
        </button>
      </div>
    </section>
  );
}
