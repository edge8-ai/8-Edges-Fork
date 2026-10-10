// The single entry path for every board mutation.
//
// Before this file, twenty server actions each hand-wrote the same three steps:
// fetch the row to learn its board, call `boardActorFor`, and turn a null actor
// into DENIED. Three of those steps are policy, not plumbing, and writing them
// twenty times meant the answer to "does a non-member learn this row exists?"
// was decided twenty times — and decided differently, because each site had its
// own "Card not found." / "Sprint not found." / "Epic not found." message that
// it returned *before* the actor was known. A stranger with a task id could
// therefore probe for existence on any board.
//
// `boardMutation` decides it once: a row that is missing and an actor who is
// denied both come back as DENIED, so a caller who may not touch the board
// learns nothing from the difference. A read that *fails* is still distinct —
// "could not load" is not "not found", and the user must not go hunting for a
// row that is still there — which is the one behaviour the old sites had to be
// told (only move-card checked it), and now every site inherits.
//
// It is a guard in the sense scripts/check-action-auth.mjs means: it is listed
// in that script's GUARDS, so an action whose first statement is a
// `boardMutation` await is gated, exactly as one that awaits `boardActorFor`.

import { companyOs } from "@/kernel/data/supabase";
import { boardActorFor, type BoardActor } from "./access";
import { DENIED } from "./card-helpers";

// Every board-scoped row carries the board it belongs to; that column is what
// the gate resolves the actor against.
export type BoardScopedRow = { board_id: string };

// The tables whose rows are board-scoped and mutated through a board action.
// board_columns joined them for the WIP limit (W.31): a column carries its
// board on the same `board_id` column every other row here does, so it gates
// the same way rather than hand-rolling a fourth lookup.
export type BoardRowTable = "tasks" | "sprints" | "epics" | "board_columns";

export type BoardLocator =
  // The board is already known (a create, where there is no row yet).
  | { boardId: string }
  // The board must be read off the row. `select` defaults to the board column
  // alone; pass more when the action needs other fields of the same row, so the
  // gate and the action share one read instead of two. `label` names the row in
  // the one message that is allowed to differ from DENIED: the load failure.
  | { table: BoardRowTable; id: string; select?: string; label: string };

export type BoardMutation<R> = { ok: true; actor: BoardActor; row: R };

export async function boardMutation<R extends BoardScopedRow = BoardScopedRow>(
  locator: BoardLocator,
): Promise<BoardMutation<R> | { ok: false; error: string }> {
  let row: R;
  if ("boardId" in locator) {
    row = { board_id: locator.boardId } as R;
  } else {
    const { data, error } = await companyOs
      .from(locator.table)
      .select(locator.select ?? "board_id")
      .eq("id", locator.id)
      .maybeSingle();
    // A failed lookup is not a missing row; saying "not found" would send the
    // user hunting for something that is still there.
    if (error) return { ok: false, error: `Could not load the ${locator.label}: ${error.message}` };
    // Deny before disclose: to a caller who cannot reach this board, a row that
    // is absent and a row that is merely out of reach must look the same.
    if (!data) return { ok: false, error: DENIED };
    row = data as unknown as R;
  }

  const actor = await boardActorFor(row.board_id);
  if (!actor) return { ok: false, error: DENIED };
  return { ok: true, actor, row };
}
