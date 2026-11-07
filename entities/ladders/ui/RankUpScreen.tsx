"use client";

// The rank-up (LD.5; spec "The rank-up"; ADR 0021): the full-screen moment
// when an act lifts the reader into a new tier, drawn as the approved
// prototype draws it (the Ladders artifact, v5, artboards 3 and 5): the helm or
// the medal with its glow, twinkles and confetti, the tier's name in its metal,
// the place it opens at, the line of praise, "Only you see this. Showing it is
// your call", and the two answers, Show it and Later. Nobody else ever sees it:
// RankUpGate reads the waiting unlock for the signed-in reader alone.
//
// It opens drawn by the server, so it is on screen with the page. With the
// reader's game style off it opens stilled and in plain words, with no art;
// under prefers-reduced-motion the stylesheet stills it (rank-up.css). The
// keyboard rules and the two answers live in rank-up-wiring.ts, where they are
// tested; this file draws and keeps three bits of state.
import { useEffect, useRef, useState } from "react";
import type { BuilderTier, LearnShareTier } from "../lib/points";
import type { RankUp } from "../lib/rank-up";
import { Emblem } from "./Emblem";
import { later, showIt, wireRankUp, type RankUpActions } from "./rank-up-wiring";

// The prototype's emblem sizes on the rank-up: the helm 190 wide, the medal
// 210; the stylesheet draws the helm at 150 on a phone.
const HELM_SIZE = 190;
const MEDAL_SIZE = 210;
const CONFETTI = 18;
const TWINKLES = 6;
// The prototype's twinkle, a four-pointed star.
const STAR = "M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z";

/** Long tier names step the headline down so "Grandmaster" fits a phone. */
function nameSize(name: string): string {
  if (name.length >= 8) return " rankup-tier--long";
  if (name.length >= 6) return " rankup-tier--mid";
  return "";
}

export function RankUpScreen({ rankUp, actions }: { rankUp: RankUp; actions: RankUpActions }) {
  // The unlock this screen has answered. The server keeps drawing it until the
  // answer is saved, so the screen closes on its id rather than on its props,
  // and a later render that brings another waiting tier opens it again.
  const [answered, setAnswered] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const open = rankUp.unlockId !== answered;

  const onLater = () => {
    if (busy) return;
    setAnswered(rankUp.unlockId);
    // Later has nothing the reader can act on if the mark fails: the screen is
    // closed on their side already, and the unlock simply shows once more later.
    void later(rankUp, actions);
  };
  const onShow = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const saved = await showIt(rankUp, actions);
    setBusy(false);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }
    setAnswered(rankUp.unlockId);
  };

  // Escape calls the newest Later, without rewiring the keyboard on each render.
  const laterRef = useRef(onLater);
  useEffect(() => {
    laterRef.current = onLater;
  });
  const openId = open ? rankUp.unlockId : null;
  useEffect(() => {
    if (!openId) return;
    return wireRankUp({
      doc: document,
      buttons: () => Array.from(dialog.current?.querySelectorAll("button") ?? []),
      onLater: () => laterRef.current(),
    });
  }, [openId]);

  if (!open) return null;
  const plain = !rankUp.gameOn;
  const kind = rankUp.ladder === "learn_share" ? "helm" : "medal";
  return (
    <div
      ref={dialog}
      className={`rankup rankup--${kind} rankup--t-${rankUp.tier}${plain ? " rankup--still rankup--plain" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rankup-tier"
      aria-describedby="rankup-praise"
      aria-busy={busy}
    >
      {plain ? null : (
        <div className="rankup-confetti" aria-hidden="true">
          {Array.from({ length: CONFETTI }, (_, k) => (
            <i key={k} />
          ))}
        </div>
      )}
      <div className="rankup-card">
        {plain ? null : (
          <div className="rankup-em">
            <span className="rankup-glow" aria-hidden="true" />
            {Array.from({ length: TWINKLES }, (_, k) => (
              <svg key={k} className="rankup-tw" viewBox="0 0 24 24" aria-hidden="true">
                <path d={STAR} />
              </svg>
            ))}
            {rankUp.ladder === "learn_share" ? (
              <Emblem ladder="learn_share" tier={rankUp.tier as LearnShareTier} size={HELM_SIZE} />
            ) : (
              <Emblem ladder="builder" tier={rankUp.tier as BuilderTier} band={rankUp.band} size={MEDAL_SIZE} />
            )}
          </div>
        )}
        <h2 className={`rankup-tier${nameSize(rankUp.tierName)}`} id="rankup-tier">
          {rankUp.tierName}
        </h2>
        <p className="rankup-sub">{rankUp.place}</p>
        <p className="rankup-praise" id="rankup-praise">
          {rankUp.praise}
        </p>
        <p className="rankup-private">Only you see this. Showing it is your call.</p>
        {error ? (
          <p className="rankup-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="rankup-acts">
          <button className="rankup-btn rankup-btn--wear" type="button" onClick={onShow}>
            Show it
          </button>
          <button className="rankup-btn" type="button" onClick={onLater}>
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
