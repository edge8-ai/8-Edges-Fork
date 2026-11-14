"use client";
// Start (W.173): Next up's button. A form bound to the server action through
// useActionState, like Give it a day, so it works before hydration and says why
// when the move is refused instead of leaving the card where it was in silence.
import { useActionState } from "react";
import { startCard } from "@/entities/boards/lib/my-week-actions";
import type { Result } from "@/kernel/data/result";

export function MyWeekStart({ taskId, title }: { taskId: string; title: string }) {
  const [state, action, pending] = useActionState<Result | null, FormData>(startCard, null);
  return (
    <form className="admin-myweek-start" action={action}>
      <input type="hidden" name="taskId" value={taskId} />
      <button type="submit" className="admin-btn admin-btn--primary admin-btn--sm" disabled={pending} aria-label={`Start “${title}”`}>
        {pending ? "Starting…" : "Start"}
      </button>
      {state && !state.ok && (
        <span className="admin-myweek-giveday-error" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}
