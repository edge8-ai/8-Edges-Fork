import type { Card } from "./board-view-types";
import type { WorkboardMoveState } from "./useWorkboardDrag";
import type { BoardSelection } from "./useBoardSelection";
import { isNewForViewer } from "./WorkboardCard";

/**
 * Everything the board can be saying about one card at once.
 *
 * Six states, and they compose: a card can be newly yours, ticked, under the
 * keyboard cursor and mid-write all at the same time, and each says a
 * different thing. Gathering them here rather than inline in the board keeps
 * the list readable and gives the two that are easy to confuse somewhere to
 * be told apart.
 *
 * `is-cursor` and `is-selected` are that pair. A CURSOR is where you are — it
 * follows j and k and there is exactly one (W.32). A SELECTION is what you
 * have ticked for the selection bar to act on, and there can be many (W.70).
 * One card is often both, which is why they are separate classes rather than
 * one; naming the keyboard's card "selected" is what would have broken the
 * bar.
 */
export function workboardCardClasses(
  card: Card,
  {
    viewerPersonId,
    moveState,
    changed,
    selection,
    cursorCardId,
  }: {
    viewerPersonId: string | null;
    moveState: WorkboardMoveState;
    /** Cards that moved since the reader last looked, while they asked to see which (W.63). */
    changed: ReadonlySet<string>;
    selection: BoardSelection | null;
    /** The card the keyboard is on (W.32); null when nothing is under the cursor. */
    cursorCardId: string | null;
  },
): string | undefined {
  return (
    [
      isNewForViewer(card, viewerPersonId) ? "is-new" : "",
      moveState.pending[card.id] ? "is-pending" : "",
      moveState.failures[card.id] ? "is-failed" : "",
      changed.has(card.id) ? "is-changed" : "",
      selection?.selected.has(card.id) ? "is-selected" : "",
      cursorCardId === card.id ? "is-cursor" : "",
      // The card this person just finished (W.67). A response to your own
      // action, set by the drag hook that ran the move, so it never arrives
      // from the server or from anybody else's board.
      moveState.completedCard === card.id ? "is-completed" : "",
    ]
      .filter(Boolean)
      .join(" ") || undefined
  );
}
