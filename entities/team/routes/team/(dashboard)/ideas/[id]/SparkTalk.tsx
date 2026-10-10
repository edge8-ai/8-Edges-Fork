"use client";

import { useState } from "react";
import { Icon } from "@/kernel/ui/Icon";
import { buildOnSpark, reactToSpark } from "../actions";

// The talk on one spark (ID.2.7): Admire and "me too" for teammates, then the
// builds and a line of your own. What it shows comes from the server after each
// save (the action revalidates the page), so the thread is never a guess.

export type TalkBuild = { id: string; who: string; initials: string; tone: number; date: string; body: string; mine: boolean };

type Props = {
  ideaId: string;
  author: string;
  isOwner: boolean;
  kind: "build" | "learning";
  admired: boolean;
  meToo: boolean;
  admireLine: string | null;
  meTooLine: string | null;
  builds: TalkBuild[];
};

export function SparkTalk(p: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await action();
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "Could not save that. Try again in a moment.");
      return;
    }
    after?.();
  }

  const meTooLabel = p.kind === "build" ? (p.meToo ? "You've hit this too" : "I've hit this too") : p.meToo ? "You'll try this" : "I'll try this";

  return (
    <>
      {(!p.isOwner || p.admireLine || p.meTooLine) && (
        <section className="sparks-card sparks-talk-answers" aria-label="Answers">
          {!p.isOwner && (
            <div className="sparks-deck-actions">
              <button type="button" className="sparks-answer sparks-answer--admire" aria-pressed={p.admired} disabled={busy} onClick={() => void run(() => reactToSpark(p.ideaId, "admire", !p.admired))}>
                <Icon name="spark" />
                {p.admired ? "You admire this" : "Admire"}
              </button>
              <button type="button" className={`sparks-answer sparks-answer--${p.kind}`} aria-pressed={p.meToo} disabled={busy} onClick={() => void run(() => reactToSpark(p.ideaId, "me_too", !p.meToo))}>
                {meTooLabel}
              </button>
            </div>
          )}
          {p.admireLine && <p className="sparks-talk-line">{p.admireLine}</p>}
          {p.meTooLine && <p className="sparks-talk-line">{p.meTooLine}</p>}
        </section>
      )}

      <section className="sparks-card" aria-labelledby="builds-h">
        <div className="sparks-field-head">
          <h2 id="builds-h" className="sparks-h2">
            Builds
          </h2>
          <span className="sparks-lede">{p.isOwner ? "Your case, a twist, or what you would try." : `${p.author} sees each one in their inbox.`}</span>
        </div>
        {/* One box, not two (W.186): with no builds the composer below carries the
            invitation, so there is no empty-state panel above it. */}
        {p.builds.length > 0 && (
          <ol className="sparks-builds">
            {p.builds.map((b) => (
              <li key={b.id} className="sparks-build">
                <span className={`sparks-avatar sparks-avatar--lg sparks-avatar--${b.tone}`} aria-hidden="true">
                  {b.initials}
                </span>
                <div className="sparks-build-body">
                  <div className="sparks-build-meta">
                    <strong>{b.mine ? "You" : b.who}</strong> · {b.date}
                  </div>
                  <p>{b.body}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
        <div className="sparks-build-box">
          <label htmlFor="spark-build">{p.isOwner ? "Add to your spark" : p.builds.length === 0 ? "Be the first to build on it" : `Build on ${p.author}'s spark`}</label>
          <textarea id="spark-build" rows={2} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder={p.builds.length === 0 ? "Your case, a twist, or what you would try. One line echoes the spark." : "e.g. Same on the sprint page. A small comment count next to the HT chip would do it"} />
          <button type="button" className="sparks-btn-dark" disabled={busy} onClick={() => void run(() => buildOnSpark(p.ideaId, text), () => setText(""))}>
            {busy ? "Posting…" : "Post build"}
          </button>
        </div>
        {error && (
          <div role="alert" className="sparks-deck-error">
            {error}
          </div>
        )}
      </section>
    </>
  );
}
