import {
  SUBJECT_CONTRACTOR_WORK,
  activeBoardsAmong,
  bearCard,
  boardOfSlug,
  columnsOfBoard,
  ensureMember,
  landCardAsSystem,
  liveCardOfSubject,
  memberBoardIds,
} from "@/entities/boards";
import { mustRows } from "@/kernel/data/read";

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

export type CardBoard = { id: string; name: string };

// The boards a request's card may go on (Dave, 2026-11-16): the Contractors
// board and every live board the contractor already works on. Only boards they
// can already open are offered, because a card's board is where they drag it to
// report hours, and putting them on a new board would show them every card
// there (Operations holds payroll and personal cards). Contractors comes first,
// as the default. A failed read raises: the list decides where a card may go.
export async function boardsForContractorCard(personId: string, teamMemberId: string): Promise<CardBoard[]> {
  const ids = await memberBoardIds(personId, teamMemberId);
  if (ids.length === 0) return [];
  const boards = mustRows(await activeBoardsAmong(ids), "[contractor-card] boards") as { id: string; slug: string; name: string }[];
  const first = boards.filter((b) => b.slug === CONTRACTOR_BOARD_SLUG);
  return [...first, ...boards.filter((b) => b.slug !== CONTRACTOR_BOARD_SLUG)].map((b) => ({ id: b.id, name: b.name }));
}

// `boardId` is a board the caller has already checked against
// boardsForContractorCard; without one the card goes on the Contractors board.
export async function openContractorCard(req: RequestForCard, boardId?: string): Promise<void> {
  const { data: existing, error: existingErr } = await liveCardOfSubject(SUBJECT_CONTRACTOR_WORK, req.id);
  if (existingErr) return void console.error("[contractor-card] existing card read failed:", existingErr.message);
  // A resend of a request that already has its card.
  if (existing) return;

  if (boardId) return bear(req, boardId, false);
  const { data: board, error: boardErr } = await boardOfSlug(CONTRACTOR_BOARD_SLUG);
  if (boardErr) return void console.error("[contractor-card] board read failed:", boardErr.message);
  if (!board) return void console.error(`[contractor-card] no "${CONTRACTOR_BOARD_SLUG}" board; card not opened for ${req.id}`);
  return bear(req, board.id, true);
}

// A chosen board is one the contractor already works on, so only the
// Contractors board adds them: a board_members row on a client's board would
// outlive the staff assignment that put them there.
async function bear(req: RequestForCard, boardId: string, join: boolean): Promise<void> {

  const { data: cols, error: colsErr } = await columnsOfBoard(boardId);
  if (colsErr) return void console.error("[contractor-card] columns read failed:", colsErr.message);
  const todo = (cols ?? []).find((c) => !c.is_done && !c.is_not_doing);
  if (!todo) return void console.error("[contractor-card] the board has no open column");

  // Born like any card (bearCard): its position, its create row, its audit row
  // and its events. Contractor requests is a routine here, not a person.
  const born = await bearCard({
    card: {
      board_id: boardId,
      board_column_id: todo.id,
      title: req.title,
      // The brief only. The /work link carries the contractor's bearer token, and
      // everybody on the board can read a card; the contractor has it by email.
      description: req.brief,
      assignee_id: req.person_id,
      priority: "p2",
      subject_type: SUBJECT_CONTRACTOR_WORK,
      subject_id: req.id,
    },
    actor: { label: "Contractor requests", personId: null, isAdmin: true },
  });
  if (!born.ok && !("persisted" in born)) return void console.error("[contractor-card] card insert failed:", born.error);
  // The card exists either way from here, so the contractor still joins the board.
  if (!born.ok) console.error("[contractor-card]", born.error);
  if (!join) return;

  // A contractor added after the board was seeded still gets to open it.
  const memberErr = await ensureMember(boardId, req.person_id);
  if (memberErr) console.error("[contractor-card] board membership failed:", memberErr);
}

// Keep the card where the request is: accepted lands it in Done, cancelled or
// rejected in Not Doing, and work sent back for revision returns it to Doing,
// so the contractor drags it to Done again and reports the new hours. A card
// already in that kind of column stays where it is.
export async function syncContractorCard(requestId: string, to: "done" | "not_doing" | "open"): Promise<void> {
  const { data: card, error: cardErr } = await liveCardOfSubject(SUBJECT_CONTRACTOR_WORK, requestId);
  if (cardErr) return void console.error("[contractor-card] card read failed:", cardErr.message);
  if (!card || card.status === to) return;

  const { data: cols, error: colsErr } = await columnsOfBoard(card.board_id as string);
  if (colsErr) return void console.error("[contractor-card] columns read failed:", colsErr.message);
  const columns = cols ?? [];
  const open = columns.filter((c) => !c.is_done && !c.is_not_doing);
  // The second open column is Doing on every seeded board; To do if there is only one.
  const target = to === "done" ? columns.find((c) => c.is_done) : to === "not_doing" ? columns.find((c) => c.is_not_doing) : open[1] ?? open[0];
  if (!target) return;

  const landed = await landCardAsSystem({ taskId: card.id, toColumnId: target.id, label: "Contractor requests" });
  if (!landed.ok) console.error("[contractor-card] card move failed:", landed.error);
}
