// A card's birth, written once (A.53).
//
// Nine places inserted a `tasks` row in seven files, and each assembled its own
// subset of what a birth owes: the position, the status the column gives, the
// completion date, the create row, the audit row and the events. Two coaching
// writers hand-rolled "the highest position plus one", four births wrote no
// create row, one of three on the board itself was audited, and none announced
// anything, so a card made straight into Done set its completion date and told
// nobody it was finished. Every birth now comes here: the caller says what the
// card is and where it goes, and this module owns what being born there means.
//
// It does not ask whether the card should exist. A duplicate check is the
// caller's question (a commitment already on the board, a meeting item already
// filed), because only the caller knows what makes two cards the same one.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert } from "@/kernel/data/supabase/database.types";
import type { BoardActor } from "./access";
import { endPosition } from "./card-helpers";
import { stageOfColumn } from "./card-stage";
import { arrivalFollowUps } from "./landing-effects";
import { insertTasks } from "./writes";

type TaskInsert = TablesInsert<{ schema: "company_os" }, "tasks">;

export type Birth = {
  // What the card is. The column decides its status and completion date and
  // the database its position, so none of those is the caller's to set.
  card: { board_id: string; board_column_id: string; title: string } & Partial<
    Pick<
      TaskInsert,
      "description" | "priority" | "assignee_id" | "epic_id" | "sprint_id" | "human_tokens" | "internal" | "due_date" | "subject_type" | "subject_id" | "metadata"
    >
  >;
  // Already gated by the caller: a person through boardMutation, or a routine
  // named by its label with no person behind it. The card's `created_by` is
  // the actor's person.
  actor: BoardActor;
  logNote?: string | null;
  // The board slugs whose pages the birth invalidates; the card's own board
  // when the caller names none.
  refreshSlugs?: string[];
  // When a card born in a done column finished, for a routine that files work
  // already finished some time ago (a campaign the writer closed last week).
  // Now, otherwise.
  completedAt?: string;
};

/**
 * `persisted` marks a failure after the row exists, as CardMoveOutcome does
 * for a move (A.41), and carries the new card's id so the caller can turn a
 * retry into an update rather than a second card. `code` is the database's, for a caller that reads
 * a unique violation as "another run filed it a moment ago". `completed` says
 * the birth was announced as a completion (a card born in Done), so a caller
 * with a notice of its own does not send the assignee a second one for the
 * same moment (A.54).
 */
export type BirthOutcome =
  | { ok: true; id: string; completed: boolean }
  | { ok: false; error: string; code?: string }
  | { ok: false; error: string; persisted: true; id: string };

export async function bearCard(b: Birth): Promise<BirthOutcome> {
  const { card, actor } = b;
  // The column's flags decide what the card is the moment it exists, and the
  // board's slug is what the events name. One read, scoped to the card's own
  // board, so a column of another board is refused rather than adopted.
  const { data: col, error: colErr } = await companyOs
    .from("board_columns")
    .select("id, is_done, is_not_doing, boards:boards!board_id(slug)")
    .eq("id", card.board_column_id)
    .eq("board_id", card.board_id)
    .maybeSingle();
  if (colErr) return { ok: false, error: colErr.message };
  if (!col) return { ok: false, error: "That column is not on this board." };
  const c = col as unknown as { is_done: boolean; is_not_doing: boolean | null; boards: { slug: string } | { slug: string }[] | null };
  const boardSlug = (Array.isArray(c.boards) ? c.boards[0] : c.boards)?.slug;
  if (!boardSlug) return { ok: false, error: "The card's board could not be read." };

  const status = stageOfColumn(c);
  const row = {
    ...card,
    created_by: actor.personId,
    status,
    // Not Doing closes a card without finishing it, so only Done dates it.
    completed_at: c.is_done ? (b.completedAt ?? new Date().toISOString()) : null,
    position: await endPosition(card.board_id, card.board_column_id),
  };
  const { data, error } = await insertTasks(row).select("id").single();
  if (error) return { ok: false, error: error.message, ...(error.code ? { code: error.code } : {}) };
  const id = (data as { id: string }).id;

  const logErr = await arrivalFollowUps({
    taskId: id,
    entry: "create",
    fromColumnId: null,
    toColumnId: card.board_column_id,
    toSprintId: card.sprint_id ?? null,
    actor,
    logNote: b.logNote ?? null,
    audit: { operation: "insert", newData: row },
    refreshSlugs: b.refreshSlugs ?? [boardSlug],
    boardSlug,
    status,
    // A card with no origin column counts as not done (landCard's
    // becomesDone), so a birth in Done is a completion and is announced like
    // one. Not imported from land-card.ts: that file reaches repeat-write.ts,
    // which bears the successor here, and the import would close a loop.
    completes: c.is_done,
    subject: { type: card.subject_type ?? null, id: card.subject_id ?? null },
    card: { title: card.title, assignee_id: card.assignee_id ?? null, metadata: card.metadata ?? null },
  });
  if (logErr) return { ok: false, persisted: true, id, error: `Card created, but its stage history could not be written: ${logErr}` };
  return { ok: true, id, completed: c.is_done };
}

/**
 * A child row's birth: a subtask, or a post under a day of content. A child is
 * not a card: it has no column, no stage history and nothing to announce, so it
 * is written as it comes, and the caller keeps the builder for its own error
 * handling. Typed so a row with a column cannot come through here instead of
 * through bearCard.
 */
export function bearSubtasks(row: TaskInsert & { parent_task_id: string; board_column_id?: null }) {
  return insertTasks(row);
}
