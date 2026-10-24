"use client";

// What each act earns on the reader's Learn & Share ladder (QS.13), for every
// button on the Quests page that shows it: the Lore composer's Share, the
// Evolve pill (QS.7) and the Beacon button (QS.6). The numbers come from the
// ladders through the learnShareStanding page slot, so Quests never writes the
// points table down itself; QuestsView provides them once for the page. Null
// when ladders is not installed (or the reader's standing could not be read):
// then no button shows points.
import { createContext, useContext } from "react";
import type { LearnShareAct } from "@/kernel/shell/page-slots";

export type ActPoints = Readonly<Record<LearnShareAct, number>>;

export const ActPointsContext = createContext<ActPoints | null>(null);

/** The points each act earns the reader, or null when the page has none to show. */
export function useActPoints(): ActPoints | null {
  return useContext(ActPointsContext);
}
