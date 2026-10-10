import {
  SUBJECT_CONTRACTOR_WORK,
  endPosition,
  ensureMember,
  insertTasks,
  landCardAsSystem,
  selectBoardColumns,
  selectBoards,
  selectTasks,
} from "@/entities/boards";

// The Contractors board mirrors the contractor work requests: every request
// sent to a contractor gets one card there, assigned to them and linked to the
// request (tasks.subject_type = contractor_work_request). The request stays the
// record — its hours are what bill and pay — and the card is where the
// contractor and the team watch the work move.
//
// Every write here is a follow-up to a request write that has already landed,
// so a failure is logged and never undoes or refuses that write: a missing card
// is visible on the board and put right by resending the request.

// Seeded by migration 20260927120000_contractor_board.sql.
const CONTRACTOR_BOARD_SLUG = "contractors";

type RequestForCard = { id: string; title: string; brief: string; person_id: string };

export async function openContractorCard(req: RequestForCard): Promise<void> {
  const { data: existing, error: existingErr } = await selectTasks("id")
    .eq("subject_type", SUBJECT_CONTRACTOR_WORK)
    .eq("subject_id", req.id)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  if (existingErr) return void console.error("[contractor-card] existing card read failed:", existingErr.message);
  // A resend of a request that already has its card.
  if (existing) return;

  const { data: board, error: boardErr } = await selectBoards("id").eq("slug", CONTRACTOR_BOARD_SLUG).maybeSingle();
  if (boardErr) return void console.error("[contractor-card] board read failed:", boardErr.message);
  if (!board) return void console.error(`[contractor-card] no "${CONTRACTOR_BOARD_SLUG}" board; card not opened for ${req.id}`);
  const boardId = board.id as string;

  const { data: cols, error: colsErr } = await selectBoardColumns("id, is_done, is_not_doing, position")
    .eq("board_id", boardId)
    .order("position");
  if (colsErr) return void console.error("[contractor-card] columns read failed:", colsErr.message);
  const todo = ((cols ?? []) as { id: string; is_done: boolean; is_not_doing: boolean }[]).find((c) => !c.is_done && !c.is_not_doing);
  if (!todo) return void console.error("[contractor-card] the board has no open column");

  const { error } = await insertTasks({
    board_id: boardId,
    board_column_id: todo.id,
    title: req.title,
    // The brief only. The /work link carries the contractor's bearer token, and
    // everybody on the board can read a card; the contractor has it by email.
    description: req.brief,
    assignee_id: req.person_id,
    priority: "p2",
    status: "open",
    subject_type: SUBJECT_CONTRACTOR_WORK,
    subject_id: req.id,
    position: await endPosition(boardId, todo.id),
  });
  if (error) return void console.error("[contractor-card] card insert failed:", error.message);

  // A contractor added after the board was seeded still gets to open it.
  const memberErr = await ensureMember(boardId, req.person_id);
  if (memberErr) console.error("[contractor-card] board membership failed:", memberErr);
}

// Keep the card where the request is: accepted lands it in Done, cancelled or
// rejected in Not Doing, and work sent back for revision returns it to Doing,
// so the contractor drags it to Done again and reports the new hours. A card
// already in that kind of column stays where it is.
export async function syncContractorCard(requestId: string, to: "done" | "not_doing" | "open"): Promise<void> {
  const { data: card, error: cardErr } = await selectTasks("id, board_id, status")
    .eq("subject_type", SUBJECT_CONTRACTOR_WORK)
    .eq("subject_id", requestId)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  if (cardErr) return void console.error("[contractor-card] card read failed:", cardErr.message);
  if (!card || card.status === to) return;

  const { data: cols, error: colsErr } = await selectBoardColumns("id, is_done, is_not_doing, position")
    .eq("board_id", card.board_id as string)
    .order("position");
  if (colsErr) return void console.error("[contractor-card] columns read failed:", colsErr.message);
  const columns = (cols ?? []) as { id: string; is_done: boolean; is_not_doing: boolean }[];
  const open = columns.filter((c) => !c.is_done && !c.is_not_doing);
  // The second open column is Doing on every seeded board; To do if there is only one.
  const target = to === "done" ? columns.find((c) => c.is_done) : to === "not_doing" ? columns.find((c) => c.is_not_doing) : open[1] ?? open[0];
  if (!target) return;

  const landed = await landCardAsSystem({ taskId: card.id as string, toColumnId: target.id, label: "Contractor requests" });
  if (!landed.ok) console.error("[contractor-card] card move failed:", landed.error);
}
