"use client";

// What each act would land for the reader (QS.15), for the Lands for you rail
// beside Campfires, the Lore and Lighthouses and for the drop where an act
// lands. It comes from the ladders through the learnShareStanding page slot,
// the reader's own and nobody else's, and QuestsView provides it once for the
// page beside the points (act-points.ts). Null when ladders is not installed
// or the reader's standing could not be read: then no rail shows and nothing
// drops.
import { createContext, useContext, type ReactNode } from "react";
import type { Lands, LearnShareAct, LearnSharePlace } from "@/entities/ladders";

/** Where the reader stands now, with their helm, and what each act lands. */
export type ReaderLands = { before: LearnSharePlace; helm: ReactNode; lands: Readonly<Record<LearnShareAct, Lands>> };

export const LandsContext = createContext<ReaderLands | null>(null);

/** What one act would land for the reader, with where they stand now and their helm, or null when the page has none to show. */
export function useLands(act: LearnShareAct): { before: LearnSharePlace; helm: ReactNode; lands: Lands } | null {
  const reader = useContext(LandsContext);
  return reader ? { before: reader.before, helm: reader.helm, lands: reader.lands[act] } : null;
}
