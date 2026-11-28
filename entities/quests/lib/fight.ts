// The monster a Bounty draws (QS.1; spec 2026-10-20). The arena is gone
// (AK.4), but the Ladders' badges still ask which monster a Bounty was, so the
// size rule stays here, once.

/** The monster a Bounty draws: by its heads first, then by the size of the Party it called. */
export type Monster = "dragon" | "big_slime" | "slime" | "hydra";

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
