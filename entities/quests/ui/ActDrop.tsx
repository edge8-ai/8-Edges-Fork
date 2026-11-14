"use client";

// The drop where an act landed (QS.15; quests spec "Lands for you"; the
// catalogue's "The unlock moment"): its points, and "New tier: Gold" when the
// act crossed into one, in the place the act was done, to the reader who did
// it, once. "+10" under the Lore composer, "+100 once someone who came is marked" by a
// fire just lit (its points land once the session is held and someone other than the Host is marked attended,
// as campfire-words says it), "+250" on the horizon.
//
// Once is kept in client state: the action's returned result sets the drop,
// which clears itself when its moment ends, and nothing is stored, so a
// reload never shows it again. The words are read from the act's Lands as it
// stood when the reader acted (lands-words.ts dropWords), because the page's
// next read already holds the new place.
//
// A badge the act found drops beside this, from the ladders' own drop, which
// the section draws after its points (QS.15b); this file names no badge. With
// the game style off the drop is a quiet line.
import { useEffect, useRef, useState } from "react";
import { Glyph, type GlyphName } from "./art";

/** How long a drop stays where the act landed (the prototype's 2.7 seconds). */
export const DROP_MS = 2700;

export type Drop = { key: number; points: string; tier: string | null };

/** A drop to show and the call that shows one; it clears itself after DROP_MS. */
export function useDrop(): [Drop | null, (words: { points: string; tier: string | null } | null) => void] {
  const [drop, setDrop] = useState<Drop | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const show = (words: { points: string; tier: string | null } | null) => {
    if (!words) return;
    if (timer.current) clearTimeout(timer.current);
    setDrop({ ...words, key: Date.now() });
    timer.current = setTimeout(() => setDrop(null), DROP_MS);
  };
  return [drop, show];
}

export function ActDrop({ drop, game, glyph, className = "" }: { drop: Drop | null; game: boolean; glyph: GlyphName; className?: string }) {
  if (!drop) return null;
  if (!game) {
    return (
      <span key={drop.key} className={`qn-shared ${className}`} role="status">
        {[drop.tier, drop.points].filter(Boolean).join(" · ")}
      </span>
    );
  }
  return (
    <span key={drop.key} className={`qn-drop ${className}`} role="status">
      <Glyph name={glyph} size={14} />
      {drop.tier && <>{drop.tier} · </>}
      <em>{drop.points}</em>
    </span>
  );
}
