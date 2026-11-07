// A place on a ladder in words (LD.2, moved here by LD.5 so the Your ladders
// panel and the rank-up say a place the same way): the tier with its division,
// stars or Immortal band, in the reader's game style. With the game style on,
// "Gold IV" and "Archon ★"; off, the same place plainly, "Gold, division IV"
// and "Archon, 1 of 5 stars". Seen by the reader alone: a worn tier is the word
// and nothing else.

/** What a place needs to be said: the tier's name and whichever of division, stars or band it has. */
export type PlaceParts = {
  tierName: string;
  division: 1 | 2 | 3 | 4 | null;
  stars: 1 | 2 | 3 | 4 | 5 | null;
  immortalBand: 1 | 2 | 3 | null;
};

const ROMAN = { 1: "I", 2: "II", 3: "III", 4: "IV" } as const;

/** The tier with its division, stars or band, in the reader's style. */
export function placeWords(s: PlaceParts, gameOn: boolean): string {
  if (s.division !== null) return gameOn ? `${s.tierName} ${ROMAN[s.division]}` : `${s.tierName}, division ${ROMAN[s.division]}`;
  if (s.stars !== null) return gameOn ? `${s.tierName} ${"★".repeat(s.stars)}` : `${s.tierName}, ${s.stars} of 5 stars`;
  if (s.immortalBand !== null) return gameOn ? `${s.tierName}, band ${s.immortalBand}` : `${s.tierName}, band ${s.immortalBand} of 3`;
  return s.tierName;
}
