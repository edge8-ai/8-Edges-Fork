"use client";

import type { Commitment } from "@/entities/coaching/lib/data/rows";
import { cardDoneSuggested } from "@/entities/coaching/lib/card-done";

// "Your board card is done — mark this kept?" (2026-09-18).
//
// A board card finishing used to close the commitment on its own. It now leaves
// a stamp and this asks the question instead, because the commitment board is
// where a person keeps their own word: the board may notice, but only the owner
// of the promise may answer.
//
// It draws nothing unless there is a question to ask, so the card that renders
// it needs no condition of its own — and it lives in its own file for the same
// reason AskNow does, CommitmentCard.tsx sitting at the 250-line cap.
//
// Two ways out, both one click, and neither louder than the card it sits on.
// "Not this one" matters as much as "Mark it kept": without it the only way to
// decline is to leave the question on the card forever, which is a nag, and the
// nag is the thing this whole change exists to remove.

export function CardDone({
  c,
  busy,
  onKept,
  onDismiss,
}: {
  c: Commitment;
  busy: boolean;
  onKept: () => void;
  // Absent on rows this viewer does not own, which is how the question reaches
  // only the person who made the promise.
  onDismiss?: () => void;
}) {
  if (!onDismiss || !cardDoneSuggested(c)) return null;
  return (
    <div className="admin-cboard-card-foot admin-cboard-card-done">
      <span className="admin-cboard-card-meta">Your board card is done.</span>
      <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={onKept}>
        Mark it kept
      </button>
      <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={onDismiss}>
        Not this one
      </button>
    </div>
  );
}
