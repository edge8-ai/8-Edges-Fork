// Creating a repeating card's successor, when the card lands in a done
// column (W.59). The rule is in repeat-card.ts and is pure; this is the part
// that touches the database, kept apart so the rule can be tested without one.

import { companyOs } from "@/kernel/data/supabase";
import { saigonToday } from "@/kernel/config/dates";
import { endPosition } from "./card-helpers";
import { plannedSuccessor } from "./repeat-card";
import { insertTaskStageLog } from "./writes";

export type SuccessorSource = {
  id: string;
  board_id: string;
  title: string;
  description: string | null;
  priority: string;
  assignee_id: string | null;
  epic_id: string | null;
  sprint_id: string | null;
  human_tokens: number | null;
  internal: boolean;
  due_date: string | null;
  metadata: Record<string, unknown>;
};

/**
 * Create the next instance of a repeating card, exactly once.
 *
 * Returns null when there is nothing to do (the card does not repeat, the
 * series has ended, or a successor already exists), and a message when
 * something went wrong that the person closing the card should be told.
 * It never throws and it never fails the move: the card really did land in
 * Done, and the successor is a consequence of that, not a condition of it.
 *
 * `columnId` is where the successor goes — the column the card came FROM, so
 * next week's instance starts where this week's started, not in Done beside
 * the one that just finished.
 */
export async function createRepeatSuccessor(
  card: SuccessorSource,
  columnId: string,
  createdBy: string | null,
): Promise<string | null> {
  const planned = plannedSuccessor(card, saigonToday());
  if (!planned) return null;

  // THE TWIN-WRITE GUARD. Two people closing the same card within seconds
  // must produce one successor, so the question asked is "does the next
  // instance exist?" and not "did we make one recently?" — a timestamp is
  // precisely the guard a race defeats. Read immediately before the insert,
  // so the window is as small as two statements can make it.
  const { data: existing, error: existErr } = await companyOs
    .from("tasks")
    .select("id")
    .eq("metadata->>repeat_of", card.id)
    .is("archived_at", null)
    .limit(1);
  // A failed check is NOT permission to insert: a second copy of a recurring
  // card is worse than a missing one, because the missing one is one click to
  // create and the duplicate has to be found first.
  if (existErr) return `the next instance could not be checked for, so none was created: ${existErr.message}`;
  if ((existing ?? []).length > 0) return null;

  const row = {
    board_id: card.board_id,
    board_column_id: columnId,
    title: card.title,
    description: card.description,
    priority: card.priority,
    assignee_id: card.assignee_id,
    epic_id: card.epic_id,
    sprint_id: card.sprint_id,
    human_tokens: card.human_tokens,
    internal: card.internal,
    created_by: createdBy,
    due_date: planned.dueDate,
    status: "open",
    position: await endPosition(card.board_id, columnId),
    // The repeat travels with the card, so the series continues without
    // anybody re-arming it; `repeat_of` is what makes the guard above work.
    metadata: { repeat: planned.repeat, repeat_of: card.id },
  };
  const { data, error } = await companyOs.from("tasks").insert(row).select("id").single();
  if (error) return `the next instance could not be created: ${error.message}`;

  // A create row, because the Flow view reads the stage log and a card
  // without one has no age.
  const { error: logErr } = await insertTaskStageLog({
    task_id: (data as { id: string }).id,
    from_column_id: null,
    to_column_id: columnId,
    to_sprint_id: card.sprint_id,
    kind: "create",
    moved_by: createdBy,
    note: "the next instance of a repeating card",
  });
  if (logErr) return `the next instance was created, but its history could not be started: ${logErr.message}`;
  return null;
}
