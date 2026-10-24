// The game's numbers (QS.1; spec 2026-10-20, "The pure arithmetic: fight" and
// "Heads"), in one place so the page, the board card and the assistant agree.
// Each head of a Bounty has its own HP: the share of the party on that head
// still out. A Turn-in on a head is a hit that takes one party member's share.
// HP only goes down, and nothing here reads a person's history: every number
// is about one head of one quest. Nothing scores a hit:
// HP is the share still out, and nothing else.

/** The monster a Bounty draws: by its heads first, then by the size of the Party it called. */
export type Monster = "dragon" | "big_slime" | "slime" | "hydra";

/** How a head ends at its due time, said with the same lightness either way. */
export type Verdict = "defeated" | "got_away";

/**
 * The share of the Party that has not turned in, as a whole percentage, never
 * below 0. An empty Party has lost nothing yet, so it is at full HP rather than
 * a division by zero.
 */
export function hp(turnedIn: number, partySize: number): number {
  if (partySize <= 0) return 100;
  return Math.max(0, Math.round(100 * (1 - turnedIn / partySize)));
}

/** At the close, a head at or under 30 HP is defeated; otherwise it got away. */
export function verdictAtClose(hpAtClose: number): Verdict {
  return hpAtClose <= 30 ? "defeated" : "got_away";
}

/**
 * Two or more heads make a Hydra, drawn with one head per ask. A one-head
 * Bounty to everyone is a dragon, to a handful a big slime, to a few a slime.
 * headCount defaults to one, the ordinary Bounty.
 */
export function monsterFor(partySize: number, headCount = 1): Monster {
  if (headCount >= 2) return "hydra";
  if (partySize >= 15) return "dragon";
  if (partySize >= 5) return "big_slime";
  return "slime";
}
