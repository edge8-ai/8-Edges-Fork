// What happens when a card lands in a column, written once.
//
// A same-board move and a cross-board move used to each spell this out: the
// position, the done state, closing the card's open children, the stage log,
// the audit row, the completion event, and the order the follow-up failures
// are reported in. The done-column half was fixed in one copy (W.4) and again
// in the other a week later (W.8), which is what a rule with two homes costs.
// Now the callers resolve WHERE the card lands — a column on this board, or a
// board and its same-named column — and this module owns what landing means.
//
// What this module deliberately does NOT do is close a linked coaching
// commitment. `coaching_commitments` is coaching's table, and an entity that
// creates board cards cannot also be one the board imports, or neither installs
// without the other. So a landing in a done column publishes
// `board.card.completed` and whoever cares subscribes (RS-13, docs/adr/0003).
// A deployment without coaching has no subscriber and the move is unaffected.
import { recordAudit } from "@/kernel/audit/audit";
import { companyOs } from "@/kernel/data/supabase";
import type { TablesUpdate } from "@/kernel/data/supabase/database.types";
import { publish } from "@/kernel/events";
import type { BoardActor } from "./access";
import { endPosition, refresh } from "./card-helpers";
import { columnStatus } from "./types";
import { insertTaskStageLog, updateTasks } from "./writes";
import { cardRepeat } from "./repeat-card";
import { createRepeatSuccessor, type SuccessorSource } from "./repeat-write";

export type CardMoveOutcome = { ok: false; error: string } | { ok: true };

export type Landing = {
  taskId: string;
  // Already gated by the caller: the same-board move through boardMutation,
  // the cross-board move through boardMutation and boardActorFor on the target.
  actor: BoardActor;
  // `isDone` is the origin column's done state when the caller already read
  // it (the cross-board move loads both boards' columns); landCard reads it
  // itself otherwise, and only on the way into a done column.
  // `status` is the card's own status before the landing, when the caller
  // loaded the card anyway: leaving Not Doing reopens what entering it closed
  // (W.139), and knowing it here costs no read on a plain drag.
  from: { boardId: string; columnId: string | null; isDone?: boolean; status?: string | null };
  // `isNotDoing` marks the Not Doing column: the card closes without being done.
  to: { boardId: string; boardSlug: string; columnId: string; isDone: boolean; isNotDoing?: boolean };
  subject: { type: string | null; id: string | null };
  // Columns the caller wants written in the same update as the landing: the
  // cross-board move clears what belonged to the old board.
  also?: TablesUpdate<{ schema: "company_os" }, "tasks">;
  // The stage-log note and any extra audit fields (the old board, say).
  logNote: string | null;
  auditExtra?: Record<string, unknown>;
  // The board slugs whose pages the landing invalidates.
  refreshSlugs: string[];
};

/**
 * Does this landing COMPLETE the card, as opposed to leaving it complete?
 *
 * `board.card.completed` states a transition, not a state — the same test
 * becomesWon() makes for deals (S.12). Without it a card already in a done
 * column that lands in one again restates a completion that happened once:
 * coaching re-raises a suggestion its owner may have dismissed, a repeating
 * card is owed a second next instance, and the completion date restarts.
 * Two paths do that today (S.13): moving a finished card to another board,
 * which lands it in that board's same-named Done, and undoing a move whose
 * logged `from` and `to` are the same done column.
 *
 * Pure, and it takes the origin column rather than a boolean, because
 * resolving the origin is the part that goes wrong. A card with no origin
 * column counts as NOT done, so its completion is announced: a duplicate
 * reaches a subscriber that is idempotent, while a swallowed completion is a
 * kept promise nobody is ever asked about.
 */
export function becomesDone(to: { isDone: boolean }, from: { is_done: boolean } | null): boolean {
  if (!to.isDone) return false;
  return !from?.is_done;
}

export async function landCard(l: Landing): Promise<CardMoveOutcome> {
  const { taskId, actor, to } = l;

  // Where the card is leaving from, needed only on the way into a done column,
  // so a plain drag between open columns never depends on it. It is read before
  // anything is written, and a failed read refuses the move outright rather
  // than guessing: guessing "not done" would restate a completion and guessing
  // "done" would swallow one.
  let origin: { is_done: boolean; is_not_doing?: boolean } | null = null;
  if (to.isDone && l.from.isDone !== undefined) {
    origin = { is_done: l.from.isDone };
  } else if (to.isDone && l.from.columnId) {
    const { data, error } = await companyOs.from("board_columns").select("is_done, is_not_doing").eq("id", l.from.columnId).maybeSingle();
    if (error) return { ok: false, error: `The card's current column could not be read, so it was not moved: ${error.message}` };
    origin = data as { is_done: boolean; is_not_doing: boolean } | null;
  }
  const completes = becomesDone(to, origin);

  const completedAt = to.isDone ? new Date().toISOString() : null;
  // Not Doing closes the card without finishing it (2026-09-24), so its
  // completed_at stays empty: every report reads that date as "finished".
  const status = columnStatus({ is_done: to.isDone, is_not_doing: to.isNotDoing });
  const updates = {
    board_id: to.boardId,
    board_column_id: to.columnId,
    position: await endPosition(to.boardId, to.columnId),
    status,
    // A card that was already done keeps the date it was finished; only a
    // landing that completes it, or one that reopens it, rewrites the date.
    ...(to.isDone && !completes ? {} : { completed_at: completedAt }),
    ...(l.also ?? {}),
  };
  // The card's title and assignee come back with the write, in the same round
  // trip, because the events below state them for the inbox (S.3): it requires
  // nothing, so it cannot read the card afterwards.
  const { data: landed, error } = await updateTasks(updates).eq("id", taskId).select("title, assignee_id, metadata").maybeSingle();
  if (error) return { ok: false, error: error.message };
  const addressed = landed
    ? { title: landed.title, assigneeId: landed.assignee_id, actorPersonId: actor.personId }
    : { actorPersonId: actor.personId };
  // The spark a card was picked up from rides on the completion (W.192), so the
  // ideas entity can say it shipped without reading the card again.
  const ideaId = (landed?.metadata as { idea_id?: unknown } | null)?.idea_id;
  const fromSpark = typeof ideaId === "string" && ideaId ? { ideaId } : {};

  // Done means done: when a card reaches a done column its open children —
  // blockers and subtasks are both child tasks — close with it. The person
  // dragging decided the card is finished; the board does not second-guess
  // that with a hard block, it makes the children agree with the parent so
  // the open-blocker badge cannot outlive the card it was on (W.4).
  // The card's own move has persisted whatever happens here, so a failure to
  // close the children is remembered and reported at the end — after the stage
  // log, the audit row and the completion event, which the move still earned.
  // A repeating card's successor (W.59). Landing in a done column is the one
  // moment the next instance is owed, and this is the seam every path into a
  // done column already goes through — the drag, the drawer's column select,
  // the planning page's Done strip and the cross-board move alike, so there
  // is exactly one place a successor can be born.
  //
  // It goes in the column the card came FROM, not in Done beside the card
  // that just finished: next week's instance starts where this week's did.
  // On a cross-board move, or from a card with no previous column, it starts
  // in the board's first non-done column instead.
  let repeatErr: string | null = null;
  if (completes) repeatErr = await repeatSuccessorFor(l, origin);

  // Not Doing closes them the same way, as not being done: a subtask of work
  // nobody is doing is not work anybody still owes. Only the OPEN children
  // move, so a child already closed the other way keeps its own answer.
  let childErr: string | null = null;
  if (status !== "open") {
    const { error: cErr } = await updateTasks({ status, completed_at: completedAt })
      .eq("parent_task_id", taskId)
      .eq("status", "open")
      .is("archived_at", null);
    if (cErr) childErr = cErr.message;
  } else if (l.from.status === "not_doing") {
    // And back again (W.139): taking a card out of Not Doing reopens the
    // children that went with it. Left closed, they could never close with
    // the card later — Done closes only OPEN children — so a card set aside
    // and then finished kept every subtask unticked for good.
    const { error: cErr } = await updateTasks({ status: "open", completed_at: null })
      .eq("parent_task_id", taskId)
      .eq("status", "not_doing")
      .is("archived_at", null);
    if (cErr) childErr = cErr.message;
  }

  // From here on the move itself has persisted. There is no transaction (that
  // needs an RPC and a migration, deferred), so each follow-up write reports
  // its own failure — after every follow-up has had its turn — and the
  // message says what did land, so the user does not retry the move and does
  // know the history needs a look.
  const { error: logErr } = await insertTaskStageLog({
    task_id: taskId,
    from_column_id: l.from.columnId,
    to_column_id: to.columnId,
    kind: "move",
    moved_by: actor.personId,
    note: l.logNote,
  });

  // The move has persisted and been logged, so it is audited here even when a
  // follow-up fails: the card really did move and the trail should say so.
  await recordAudit({ table: "tasks", recordId: taskId, operation: "update", actor: actor.label, newData: { ...updates, ...(l.auditExtra ?? {}) } });
  for (const slug of l.refreshSlugs) refresh(slug);

  // Published after the move has persisted and been audited, so a subscriber
  // never acts on a move that did not land, and under the board the card now
  // lives on, so a subscriber that links back links to where the card is.
  // Handler failures are the bus's to log and audit; they cannot fail this.
  if (completes) {
    await publish("board.card.completed", { taskId, boardSlug: to.boardSlug, subjectType: l.subject.type, subjectId: l.subject.id, ...fromSpark, ...addressed });
  }
  // Every landing, whatever it did to the status, for the subscriber whose
  // card stands for something else's state (a day of content, a campaign).
  await publish("board.card.landed", { taskId, boardSlug: to.boardSlug, status, subjectType: l.subject.type, subjectId: l.subject.id, ...addressed });
  // A failed stage log is reported after the audit row and the completion
  // event, which the move earned by persisting: returning on it first left a
  // done move with no audit row and a commitment nobody marked kept.
  if (logErr) return { ok: false, error: `Card moved, but the stage history could not be written: ${logErr.message}` };
  if (childErr) return { ok: false, error: `Card moved, but its open blockers and subtasks could not be closed: ${childErr}` };
  if (repeatErr) return { ok: false, error: `Card moved, but ${repeatErr}.` };
  return { ok: true };
}

/**
 * The repeating card's successor, or a message saying why there is not one.
 *
 * Reads the card back rather than taking it from the caller: every path into
 * landCard already knows the task id and none of them carries the whole row,
 * and a successor is a copy — it needs the fields the caller never had.
 *
 * `origin` is the column the card left, as landCard already resolved it. It is
 * only ever open, Not Doing or unknown here: a card leaving a done column does not
 * complete, so it is owed no successor.
 */
async function repeatSuccessorFor(l: Landing, origin: { is_done: boolean; is_not_doing?: boolean } | null): Promise<string | null> {
  const { data, error } = await companyOs
    .from("tasks")
    .select("id, board_id, title, description, priority, assignee_id, epic_id, sprint_id, human_tokens, internal, due_date, metadata")
    .eq("id", l.taskId)
    .maybeSingle();
  if (error) return `whether it repeats could not be read, so no next instance was created: ${error.message}`;
  const card = data as SuccessorSource | null;
  if (!card || !cardRepeat(card)) return null;

  // Where the successor starts. The column the card came from, when that is
  // on the board it is landing on and is not itself a done column; failing
  // that, the board's first non-done column.
  // Never back into Not Doing (W.139): a card set aside and then finished owes
  // next week an OPEN instance, not one parked where nobody looks.
  let columnId = l.from.boardId === l.to.boardId && origin?.is_done === false && origin.is_not_doing !== true ? l.from.columnId : null;
  if (!columnId) {
    const { data: first, error: firstErr } = await companyOs
      .from("board_columns")
      .select("id")
      .eq("board_id", l.to.boardId)
      .eq("is_done", false)
      .eq("is_not_doing", false)
      .order("position")
      .limit(1)
      .maybeSingle();
    if (firstErr) return `its next instance's column could not be read, so none was created: ${firstErr.message}`;
    columnId = (first as { id: string } | null)?.id ?? null;
    if (!columnId) return "this board has no open column for its next instance";
  }
  return createRepeatSuccessor(card, columnId, l.actor.personId);
}
