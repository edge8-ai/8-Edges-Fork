import type { ReactNode } from "react";

/**
 * An empty section label's worth of space at the top of a lane (W.114).
 *
 * When one lane draws a label over its first card — the Workboard's "This
 * sprint", planning's "Carried" — that lane's first card sits lower than its
 * neighbours', and every row after it stays out of line. The lanes without a
 * label take this instead: the same markup as a label, holding a non-breaking
 * space, so it is exactly as tall, and hidden from assistive tech because it
 * says nothing.
 *
 * It is a section only as far as the kanban's markup goes. A caller that asks
 * "is this column sectioned" (the Workboard's drag-to-reorder gate) must keep
 * asking about the real groups, not this one.
 */
export function laneLabelSlot<T>(columnId: string, cards: T[]): { key: string; heading: ReactNode; cards: T[] }[] {
  return [
    {
      key: `${columnId}-slot`,
      heading: (
        <span className="admin-kanban-col-section-label" aria-hidden="true">
          {"\u00a0"}
        </span>
      ),
      cards,
    },
  ];
}
