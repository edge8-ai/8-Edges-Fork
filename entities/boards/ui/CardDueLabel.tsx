import { Icon } from "@/kernel/ui/Icon";
import { chipDate, shortDate } from "./card-chips";

/**
 * The due pill's contents in the drawer bar. When the deadline rule has moved
 * the date, the pill says when it was first due (W.207.5): no weekday on the
 * first date, and a phone gives it a second line (admin.css, .wb-due-first).
 */
export function DueLabel({ dueDate, firstDueDate }: { dueDate: string; firstDueDate: string | null }) {
  return (
    <>
      <Icon name="calendar" />
      {dueDate ? chipDate(dueDate) : "Due date"}
      {dueDate && firstDueDate && (
        <span className="wb-chip-muted wb-due-first">
          <span className="wb-due-first-sep"> · </span>first due {shortDate(firstDueDate)}
        </span>
      )}
    </>
  );
}

/** The pill's accessible name: both dates in full, so a screen reader hears what the eye sees. */
export function dueName(dueDate: string, firstDueDate: string | null): string {
  return `Due ${chipDate(dueDate)}${firstDueDate ? `, first due ${chipDate(firstDueDate)}` : ""}`;
}
