// The words the Stuck column uses (K.45). Stuck is where a member says they
// need a hand, so nothing here reads as a failure or a flag: the field asks
// what is in the way rather than why the card is stuck, the move hint names
// the coach who can help, and the empty column invites the admission instead
// of congratulating its absence.
//
// They sit in one pure module because two client components and a test share
// them, and because copy this deliberate is easier to keep honest in one place
// than spread across the components that render it.

export const STUCK_WHY_PLACEHOLDER = "What's in the way?";

export const STUCK_EMPTY = "Nothing stuck. If something is, say so — that is what the column is for.";

/**
 * The line under "Move to Stuck" in a card's move menu. A coach with a name is
 * the person to ask; without one the offer still stands, just unaddressed.
 */
export function stuckMoveHint(coachName: string | null | undefined): string {
  const name = coachName?.trim();
  return name ? `Ask ${name} for a hand` : "Ask for a hand";
}
