"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/kernel/ui/Icon";
import { answerCheckIn, buildOnSpark, reactToSpark } from "./actions";
import { DeckAnswers, type DeckAnswer } from "./DeckAnswers";
import { KIND_LABEL, type SparkKind } from "./sparks-model";

// Your deck (ID.2.6): the sparks you haven't answered, one at a time, and at
// most one "did it hold?" at the end (ID.2.9). The cards are taken once, when
// the page first renders: an answer revalidates the page, and a deck that
// re-sorted itself under you would be a different deck. A card moves on only
// after the server has saved the answer, so a failure leaves it where it was
// and says so, instead of an answer that silently vanished.

export type DeckCard = {
  id: string;
  kind: SparkKind;
  title: string;
  hook: string | null;
  who: string;
  initials: string;
  tone: number;
  date: string;
  faces: { initials: string; tone: number }[];
  admireLine: string | null;
  builds: number;
  checkIn: boolean;
};

const LEAVE_MS = 320;

function save(card: DeckCard, answer: DeckAnswer): Promise<{ ok: boolean; error?: string }> {
  if (answer === "held" || answer === "trying" || answer === "unstuck") return answerCheckIn(card.id, answer);
  return reactToSpark(card.id, answer);
}

function said(card: DeckCard, answer: DeckAnswer): string {
  switch (answer) {
    case "admire":
      return `${card.who} will see you admire it.`;
    case "me_too":
      return card.kind === "build" ? `${card.who} will see you've hit this too.` : `${card.who} will see you'll try it.`;
    case "skip":
      return "Skipped. It stays in All sparks.";
    case "held":
      return `${card.who} will see it held for you.`;
    case "trying":
      return "Noted. We'll ask again in two weeks.";
    case "unstuck":
      return `${card.who} will see it didn't stick. That helps too.`;
  }
}

export function SparkDeck({ initial }: { initial: DeckCard[] }) {
  const [cards] = useState(initial);
  const [i, setI] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buildOpen, setBuildOpen] = useState(false);
  const [text, setText] = useState("");

  const card = cards[i];
  const done = i >= cards.length;

  async function settle(run: () => Promise<{ ok: boolean; error?: string }>, message: string) {
    if (busy || !card) return;
    setBusy(true);
    setError(null);
    const r = await run();
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "Could not save that. Try again in a moment.");
      return;
    }
    setLast(message);
    setBuildOpen(false);
    setText("");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setI((n) => n + 1);
      return;
    }
    setLeaving(true);
    window.setTimeout(() => {
      setLeaving(false);
      setI((n) => n + 1);
    }, LEAVE_MS);
  }

  if (cards.length === 0) {
    return (
      <div className="sparks-deck-empty">
        <strong>Nothing waiting for you.</strong> You&apos;ve answered every spark. Share one of your own above, and it lands in your
        teammates&apos; decks.
      </div>
    );
  }

  return (
    <div className="sparks-deck">
      <div className="sparks-deck-progress" aria-hidden="true">
        {cards.map((c, k) => (
          <span key={c.id} className={k < i ? "is-done" : k === i ? "is-now" : ""} />
        ))}
      </div>
      <p className="sparks-sr" aria-live="polite">
        {done ? "Deck done." : `Spark ${i + 1} of ${cards.length}.`}
      </p>

      {done ? (
        <div className="sparks-deck-card sparks-deck-card--done">
          <span className="sparks-deck-check" aria-hidden="true">
            <Icon name="check" />
          </span>
          <strong>You&apos;re caught up.</strong>
          <p>Whoever shared those knows someone read them. More arrive as teammates share.</p>
        </div>
      ) : (
        <article className={`sparks-deck-card${leaving ? " is-leaving" : ""}`} aria-labelledby={`deck-${card.id}`}>
          <div className="sparks-chips">
            {card.checkIn && <span className="sparks-checkin-chip">Check-in · only you and {card.who} see your answer</span>}
            <span className={`sparks-kind-chip sparks-kind-chip--${card.kind}`}>{KIND_LABEL[card.kind]}</span>
            <span className="sparks-deck-date">{card.date}</span>
          </div>
          {card.checkIn && <p className="sparks-checkin-q">You said you&apos;d try this. Did it hold?</p>}
          <h3 id={`deck-${card.id}`} className="sparks-deck-title">
            {card.title}
          </h3>
          {card.hook && card.hook !== card.title && <p className="sparks-deck-hook">{card.hook}</p>}
          <Link className="sparks-deck-open" href={`/team/ideas/${card.id}`}>
            Open the spark{card.builds > 0 ? ` and its ${card.builds === 1 ? "build" : `${card.builds} builds`}` : ""}
          </Link>
          {card.admireLine && !card.checkIn && (
            <div className="sparks-faces-line">
              <span className="sparks-faces" aria-hidden="true">
                {card.faces.map((f, k) => (
                  <span key={k} className={`sparks-avatar sparks-avatar--sm sparks-avatar--${f.tone}`}>
                    {f.initials}
                  </span>
                ))}
              </span>
              {card.admireLine}
            </div>
          )}

          {buildOpen && !card.checkIn && (
            <div className="sparks-build-box">
              <label htmlFor={`build-${card.id}`}>Build on {card.who}&apos;s spark</label>
              <div className="sparks-story-row">
                <input
                  id={`build-${card.id}`}
                  value={text}
                  maxLength={500}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Your case, a twist, or what you would try"
                />
                <button
                  type="button"
                  className="sparks-btn-dark"
                  disabled={busy}
                  onClick={() => void settle(() => buildOnSpark(card.id, text), `Your build is on ${card.who}'s spark. They'll see it in their inbox.`)}
                >
                  Send
                </button>
              </div>
            </div>
          )}

          <div className="sparks-deck-foot">
            <div className="sparks-by">
              <span className={`sparks-avatar sparks-avatar--${card.tone}`} aria-hidden="true">
                {card.initials}
              </span>
              <span>{card.who}</span>
            </div>
            <DeckAnswers
              kind={card.kind}
              checkIn={card.checkIn}
              busy={busy}
              buildOpen={buildOpen}
              onAnswer={(a) => void settle(() => save(card, a), said(card, a))}
              onToggleBuild={() => setBuildOpen((o) => !o)}
            />
          </div>
          {error && (
            <div role="alert" className="sparks-deck-error">
              {error}
            </div>
          )}
        </article>
      )}

      <div className="sparks-deck-last" aria-live="polite">
        {last && (
          <>
            <Icon name="check" />
            {last}
          </>
        )}
      </div>
    </div>
  );
}
