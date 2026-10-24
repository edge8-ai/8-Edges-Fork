"use client";
// Give it a day (W.171): a date and a button under a card that has no day in
// this sprint. A form bound to a server action through useActionState, so it
// submits before the page hydrates and says why when the write is refused —
// a failure that read as success would leave the card with no day and the
// reader believing it had one.
import { useActionState } from "react";
import { giveDay } from "@/entities/boards/lib/my-week-actions";
import type { Result } from "@/kernel/data/result";

export function MyWeekGiveDay({ taskId, title, defaultDay, today }: { taskId: string; title: string; defaultDay: string; today: string }) {
  const [state, action, pending] = useActionState<Result | null, FormData>(giveDay, null);
  return (
    <form className="admin-myweek-giveday" action={action}>
      <input type="hidden" name="taskId" value={taskId} />
      <label className="admin-myweek-giveday-field">
        <span className="u-sr-only">A day for “{title}”</span>
        <input type="date" name="due" min={today} defaultValue={defaultDay} required />
      </label>
      <button type="submit" className="admin-btn admin-btn--sm" disabled={pending}>
        {pending ? "Setting…" : "Set day"}
      </button>
      {state && !state.ok && (
        <span className="admin-myweek-giveday-error" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}
