import { getWorkboard, type WorkboardBoard } from "./workboard";
import type { BoardState } from "./board-state";

/** The board state with the boards themselves, for an agent that names or links a card's board. */
export type BoardStateRead = BoardState & { boards: WorkboardBoard[] };

/**
 * The one board read every reporting agent makes (U.2): every active board,
 * its lanes and its top-level cards, through the same read model the
 * Workboard renders, so a report counts what the board shows. It raises when
 * the boards, columns or cards cannot be read (getWorkboard), because a
 * report built on half a board would be wrong without saying so. Classify a
 * person's cards from it with personBoardState (board-state.ts).
 */
export async function readBoardState(): Promise<BoardStateRead> {
  const { boards, lanes, cards } = await getWorkboard({ scope: { kind: "all" } });
  return { boards, lanes, cards };
}
