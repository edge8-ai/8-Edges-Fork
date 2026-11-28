"use client";

import { formatDate } from "@/kernel/ui/format";
import { leaveCovering, nextClearDay, type LeaveSpan } from "@/entities/coaching/lib/leave-window";

// "Derek is on leave that week" (L.2).
//
// The tone is the point. A day somebody is away is not a conflict, an error or
// a warning — it is a colleague's holiday. So this is a sentence in the picker's
// own voice, in the growth hue the rest of the page uses, and there is no red
// anywhere in it. It says who is away, until when, and which day is clear.
//
// It draws nothing when the chosen day is fine, which is almost always.

export function LeaveNote({
  dateISO,
  spans,
  who,
}: {
  /** The day being considered; nothing is drawn until one is chosen. */
  dateISO: string | null;
  spans: LeaveSpan[];
  /** Whose holiday it is, named, because "somebody is away" helps nobody. */
  who: string;
}) {
  if (!dateISO) return null;
  const covering = leaveCovering(dateISO, spans);
  if (!covering) return null;

  // The clear day offered keeps the weekday being considered: the rhythm is
  // the pair's weekday, and the first clear day alone can be a Saturday.
  const clear = nextClearDay(covering.endDate, spans, new Date(`${dateISO}T00:00:00`).getDay());
  return (
    <p className="coach-leave-note">
      <strong>
        {who} is on leave {formatDate(covering.startDate)}
        {covering.endDate !== covering.startDate ? ` to ${formatDate(covering.endDate)}` : ""}.
      </strong>{" "}
      {clear ? `${formatDate(clear)} is clear.` : "The next three weeks are booked out."}
    </p>
  );
}
