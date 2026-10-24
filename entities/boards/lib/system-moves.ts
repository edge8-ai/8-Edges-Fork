import { companyOs } from "@/kernel/data/supabase";
import { landCard, type CardMoveOutcome, type Landing } from "./land-card";

// A card moved by a routine rather than a person: the Revenue board's content
// sync closes a day once every post on it is out, and moves a campaign's
// writer card as the writer moves. Same landing as a drag (land-card.ts owns
// what landing means), so the position, the children, the stage log, the
// audit row and the events are identical; only the actor differs. The label
// names the routine in the history, and there is no person to record.
//
// Not a server action: a routine calls it in-process, and nothing a browser
// can reach may move a card without passing the board's gate.
export async function landCardAsSystem(input: {
  taskId: string;
  toColumnId: string;
  label: string;
  // Columns written in the same update as the landing, such as a marker that
  // the routine moved this card, so the marker and the move land together.
  also?: Landing["also"];
}): Promise<CardMoveOutcome> {
  const { data: task, error: taskErr } = await companyOs
    .from("tasks")
    .select("id, board_id, board_column_id, subject_type, subject_id, boards:boards!board_id(slug)")
    .eq("id", input.taskId)
    .maybeSingle();
  if (taskErr) return { ok: false, error: taskErr.message };
  if (!task) return { ok: false, error: "That card no longer exists." };
  const t = task as unknown as {
    board_id: string;
    board_column_id: string | null;
    subject_type: string | null;
    subject_id: string | null;
    boards: { slug: string } | { slug: string }[] | null;
  };
  if (t.board_column_id === input.toColumnId) return { ok: true };
  const { data: col, error: colErr } = await companyOs
    .from("board_columns")
    .select("id, is_done, is_not_doing")
    .eq("id", input.toColumnId)
    .eq("board_id", t.board_id)
    .maybeSingle();
  if (colErr) return { ok: false, error: colErr.message };
  if (!col) return { ok: false, error: "That column is not on the card's board." };
  const c = col as { is_done: boolean; is_not_doing: boolean };
  const slug = (Array.isArray(t.boards) ? t.boards[0] : t.boards)?.slug ?? "";
  return landCard({
    taskId: input.taskId,
    actor: { label: input.label, personId: null, isAdmin: true },
    from: { boardId: t.board_id, columnId: t.board_column_id },
    to: { boardId: t.board_id, boardSlug: slug, columnId: input.toColumnId, isDone: c.is_done, isNotDoing: c.is_not_doing },
    subject: { type: t.subject_type, id: t.subject_id },
    also: input.also,
    logNote: `Moved by ${input.label}`,
    refreshSlugs: slug ? [slug] : [],
  });
}
