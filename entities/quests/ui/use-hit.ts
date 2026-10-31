"use client";

// The hit that just landed (QS.1): when a head's hit count rises between two
// renders (after the page refreshes from a move), the stage plays the slash for
// under a second and the Giver greets the newest lit portrait for five. A hit
// is a hit: nothing on it is scored.
import { useEffect, useState } from "react";
import type { Portrait } from "../lib/quests-read";

type FreshHit = { name: string; mine: boolean; personId: string };

export function useHit(hits: number, newest: Portrait | undefined, me: Portrait): { fresh: FreshHit | null; striking: boolean } {
  const [seen, setSeen] = useState(hits);
  const [fresh, setFresh] = useState<FreshHit | null>(null);
  const [striking, setStriking] = useState(false);
  if (hits !== seen) {
    setSeen(hits);
    if (hits > seen) {
      setFresh(newest ? { name: newest.name, mine: newest.personId === me.personId, personId: newest.personId } : null);
      setStriking(true);
    }
  }
  useEffect(() => {
    if (!striking) return;
    const strike = setTimeout(() => setStriking(false), 900);
    return () => clearTimeout(strike);
  }, [striking]);
  useEffect(() => {
    if (!fresh) return;
    const line = setTimeout(() => setFresh(null), 5000);
    return () => clearTimeout(line);
  }, [fresh]);
  return { fresh, striking };
}
