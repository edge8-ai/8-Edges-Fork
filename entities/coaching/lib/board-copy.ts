import type { BoardColumnId } from "./types";
import { STUCK_EMPTY } from "./stuck-copy";

// The commitment board's own words: what the live region says after a move,
// and what an empty column says instead of nothing.
//
// They sit apart from the board that renders them for the same reason the Stuck
// copy does — this is writing, and writing is easier to keep honest when it is
// all in one place and not scattered through JSX — and because CommitmentBoard
// is at the 250-line client-component cap, where every line spent on a string
// is a line not spent on the board.

// What the line under the board says after a move. Plain, and about the
// commitment, never about the person who moved it.
export const MOVE_TOAST: Record<BoardColumnId, string> = {
  on_it: "Back on it.",
  // Stuck asks for help rather than reporting a fault, and the column is
  // labelled Stuck, so the line that follows a move there says so too (K.45).
  blocked: "Stuck. Say what's in the way; your coach gets a note.",
  done: "Kept.",
};

// What an empty column says. About the cards, never the person, and never a
// nag. An empty Stuck column used to read "Nothing blocked. Good.", which
// quietly makes using the column the bad outcome; K.45 turns it into an
// invitation instead.
export const EMPTY_COLUMN: Record<string, string> = {
  on_it: "Nothing on it yet. Add a card below.",
  blocked: STUCK_EMPTY,
  done: "Kept cards land here.",
  promised: "Nothing promised to you yet.",
};
