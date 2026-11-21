"use client";

// Whether the page is drawn in its game style (QS.11). QuestsView provides it
// from the reader's switch; the pieces both views share (the moves, the Summon
// drawer) read it to say "Hit landed" or "Answered", "Summon" or "Post". On by
// default, so a piece drawn outside the page keeps the game's words.
import { createContext, useContext } from "react";

export const GameStyleContext = createContext(true);

export function useGameStyle(): boolean {
  return useContext(GameStyleContext);
}
