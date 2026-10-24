"use client";

// The Show switch on each ladder of the Your ladders panel (LD.4; spec
// "Wearing"; ADR 0021). Off until the person turns it on: nobody learns a tier
// until its holder shows it. Showing Learn & Share puts the tier's border round
// the person's face on the team surface; showing Builder puts the medal on the
// profile plaque and the postcard (LD.6). The words are the approved
// prototype's: "Show", named "Show the <ladder> emblem".
//
// It flips at once and saves behind, as the game style switch does; if the save
// fails it flips back and says so, because a switch that shows a state it did
// not keep would be a quiet lie. It shows only to someone who holds
// ladders.mine (the hidden-control convention, ADR 0014); setWear's own guard
// is the rule.
import { useState, useTransition } from "react";
import type { MayProp } from "@/kernel/identity/may-prop";
import { setWear } from "../lib/display-actions";
import { LADDER_WORDS, type Ladder } from "../lib/points";

/**
 * `onWorn` hears every flip, the optimistic one and a flip back after a failed
 * save, so a page that draws the worn tier elsewhere (the profile's plaque,
 * LD.6) follows the switch at once.
 */
export function WearSwitch({ ladder, worn, may, onWorn }: { ladder: Ladder; worn: boolean; may: MayProp; onWorn?: (on: boolean) => void }) {
  const [on, setOn] = useState(worn);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const show = (value: boolean) => {
    setOn(value);
    onWorn?.(value);
  };
  const flip = () => {
    const next = !on;
    setError(null);
    show(next);
    start(async () => {
      const saved = await setWear(ladder, next);
      if (!saved.ok) {
        show(!next);
        setError(saved.error);
      }
    });
  };
  if (!may["ladders.mine"]) return null;
  return (
    <span className="yl-wear">
      <button type="button" className="yl-wear-sw" role="switch" aria-checked={on} aria-label={`Show the ${LADDER_WORDS[ladder]} emblem`} aria-busy={pending} onClick={flip}>
        <span className="yl-wear-track" aria-hidden="true" />
        Show
      </button>
      {error && (
        <span className="yl-wear-err" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
