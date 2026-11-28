"use client";

import { Icon } from "@/kernel/ui/Icon";
import type { SparkKind } from "./sparks-model";

// The buttons at the foot of a deck card (ID.2.6, ID.2.9): the one-tap answers
// on a spark, or the three answers to "did it hold?". Pure presentation: the
// deck decides what each answer saves and says.

export type DeckAnswer = "admire" | "me_too" | "skip" | "held" | "trying" | "unstuck";

type Props = {
  kind: SparkKind;
  checkIn: boolean;
  busy: boolean;
  buildOpen: boolean;
  onAnswer: (answer: DeckAnswer) => void;
  onToggleBuild: () => void;
};

export function DeckAnswers({ kind, checkIn, busy, buildOpen, onAnswer, onToggleBuild }: Props) {
  if (checkIn) {
    return (
      <div className="sparks-deck-actions">
        <button type="button" className="sparks-answer sparks-answer--learning" disabled={busy} onClick={() => onAnswer("held")}>
          It held
        </button>
        <button type="button" className="sparks-answer" disabled={busy} onClick={() => onAnswer("trying")}>
          Still trying
        </button>
        <button type="button" className="sparks-answer" disabled={busy} onClick={() => onAnswer("unstuck")}>
          Didn&apos;t stick
        </button>
      </div>
    );
  }
  return (
    <div className="sparks-deck-actions">
      <button type="button" className="sparks-answer sparks-answer--admire" disabled={busy} onClick={() => onAnswer("admire")}>
        <Icon name="spark" />
        Admire
      </button>
      <button type="button" className={`sparks-answer sparks-answer--${kind}`} disabled={busy} onClick={() => onAnswer("me_too")}>
        {kind === "build" ? "I've hit this too" : "I'll try this"}
      </button>
      <button type="button" className="sparks-answer" aria-expanded={buildOpen} onClick={onToggleBuild}>
        <Icon name="comment" />
        Build on it
      </button>
      <button type="button" className="sparks-answer-text" disabled={busy} onClick={() => onAnswer("skip")}>
        Skip
      </button>
    </div>
  );
}
