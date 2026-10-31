import { settleWrite, wasUnanswered } from "@/kernel/ui/hooks/settle-write";
import type { ActionResult } from "./board-view-types";

// Running one board verb over several cards (W.70).
//
// The writes are the SAME per-card server actions the drawer calls — not a
// second set that takes a list. That is deliberate, and it is the whole
// argument for why bulk editing on the board is cheap rather than a new
// surface area:
//
//   · every card keeps its own guard. `boardMutation` resolves the actor
//     against THAT card's board, so a selection spanning two boards is
//     checked twice and a card on a board the viewer cannot touch is refused
//     on its own, not smuggled in behind one that passed;
//   · every card keeps its own rules. Setting an epic still checks the epic
//     belongs to that card's board; archiving still only archives a live card;
//   · there is no third code path to keep in step with the first two.
//
// The cost is N round trips, paid sequentially so two writes cannot race for
// the same position, and the ceiling is a handful of cards a person ticked by
// hand. The honest report below is what the bar shows afterwards.

export type BulkOutcome = {
  /** How many cards the verb was applied to successfully. */
  done: number;
  /** One message per card that refused, in the order they were tried. */
  failures: string[];
  /**
   * How many of those were never answered. A refusal changed nothing, but a
   * request that never completed may have landed with its response lost, so
   * the caller refreshes when this is above zero (A.33).
   */
  unanswered: number;
};

/**
 * Apply `write` to each id in turn and report what happened.
 *
 * Never rejects: a caller in a React event handler has nowhere to put a
 * rejection, and a request that never completed has to read as a refusal of
 * that one card rather than as the whole batch vanishing. A failure does not
 * stop the run — the other cards were selected too, and abandoning them would
 * leave the person with a half-applied change they did not ask for and cannot
 * see the shape of.
 */
export async function runBulk(ids: string[], write: (id: string) => Promise<ActionResult>): Promise<BulkOutcome> {
  let done = 0;
  let unanswered = 0;
  const failures: string[] = [];
  for (const id of ids) {
    const r = await settleWrite(() => write(id));
    if (r.ok) done += 1;
    else {
      failures.push(r.error);
      if (wasUnanswered(r)) unanswered += 1;
    }
  }
  return { done, failures, unanswered };
}

/**
 * What the person is told afterwards, in one sentence, or null when every
 * card went through and there is nothing to say.
 *
 * Repeated reasons are collapsed: ten cards refused for one reason is one
 * fact, and printing it ten times buries it.
 */
export function bulkMessage(outcome: Pick<BulkOutcome, "done" | "failures">, verb: string): string | null {
  if (outcome.failures.length === 0) return null;
  const reasons = [...new Set(outcome.failures)];
  const applied = outcome.done > 0 ? `${verb} ${outcome.done} card${outcome.done === 1 ? "" : "s"}; ` : "";
  const refused = `${outcome.failures.length} refused: ${reasons.join(" · ")}`;
  return `${applied}${refused}`;
}
