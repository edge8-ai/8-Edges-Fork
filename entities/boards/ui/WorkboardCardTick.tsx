"use client";

import { useEffect, useRef } from "react";
import type { BoardSelection } from "./useBoardSelection";

/** How long a finger has to rest on a card before it turns picking on. */
const LONG_PRESS_MS = 450;

/**
 * The bulk-selection tick box on one Workboard card (W.70, quietened in W.93).
 *
 * W.70 drew it on every card, always, at the top-left, with no label and no
 * context. On a phone that is a mystery tick above a title: nothing on the
 * screen says what it is for until one is pressed. So the box is now REVEALED
 * rather than resident, by whichever of four things is true — and none of them
 * changes what it does, only when it can be seen:
 *
 *   · the pointer is over this card, or the keyboard is inside it (CSS, so no
 *     re-render follows a mouse across a column of forty cards);
 *   · the box itself has focus, which the same :focus-within rule covers, so
 *     Tab can always reach it;
 *   · something is ticked anywhere — then every card shows its box, because a
 *     person who ticked one needs to see where the others are;
 *   · picking was turned on, by the toolbar's Select or by a long press here.
 *
 * The long press is the touch answer: a touch screen has no hover, so without
 * it the first three rules would leave a phone with no way in at all. It is
 * bound to the card element rather than to this box — you cannot press a
 * control you cannot see — which is why this reaches for `closest`; the card
 * element belongs to the kernel's KanbanBoard and is not this file's to render.
 * A finger that moves is a scroll or a drag, so it cancels.
 *
 * Split out of WorkboardKanbanCard so that file stays the list of what a
 * draggable holds rather than the rules for one of them.
 */
export function WorkboardCardTick({
  cardId,
  title,
  selection,
}: {
  cardId: string;
  title: string;
  selection: BoardSelection;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { startPicking } = selection;

  useEffect(() => {
    const card = ref.current?.closest(".admin-kanban-card");
    if (!card) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const start = () => {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        startPicking();
      }, LONG_PRESS_MS);
    };
    card.addEventListener("touchstart", start, { passive: true });
    card.addEventListener("touchend", cancel);
    card.addEventListener("touchmove", cancel, { passive: true });
    card.addEventListener("touchcancel", cancel);
    return () => {
      cancel();
      card.removeEventListener("touchstart", start);
      card.removeEventListener("touchend", cancel);
      card.removeEventListener("touchmove", cancel);
      card.removeEventListener("touchcancel", cancel);
    };
  }, [startPicking]);

  return (
    <div ref={ref} className={`admin-kanban-card-head wb-card-tick${selection.picking ? " is-shown" : ""}`}>
      <input
        type="checkbox"
        checked={selection.selected.has(cardId)}
        aria-label={`Select ${title}`}
        onChange={() => selection.toggle(cardId)}
        // The click stops here or every tick would also open the card's drawer.
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
