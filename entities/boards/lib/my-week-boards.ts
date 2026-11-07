// "Your boards" on My Week (W.169; split out of my-week.ts in W.171 when that
// file passed the 400-line cap): one summary per board the reader has work on.
// It reads only what the model already placed, so it takes rows by the few
// fields it needs rather than the model's types, and imports nothing back.
import type { MyWeekBoard, MyWeekCard } from "./my-week-read";

/** The parts of a My Week row a board summary reads. */
type SummaryRow = { title: string; due: string | null; lateDays: number; doing: boolean };

export type MyWeekBoardSummary = {
  id: string;
  name: string;
  client: string | null;
  href: string;
  open: number;
  late: number;
  doing: number;
  done: number;
  next: { title: string; due: string } | null;
};

/**
 * One summary per board the reader has work on this sprint: counts of their
 * own cards by state, and the next card due that is not already late. Boards
 * with something late lead, then the busiest. The link opens the Workboard on
 * that board, which shows the reader's own cards by default (W.166) — so the
 * URL names a board and never a person.
 */
export function boardSummaries(
  open: { card: MyWeekCard; row: SummaryRow }[],
  done: MyWeekCard[],
  boardById: Map<string, MyWeekBoard>,
  today: string,
): MyWeekBoardSummary[] {
  const per = new Map<string, MyWeekBoardSummary>();
  const entry = (boardId: string | null) => {
    const board = boardId ? boardById.get(boardId) : undefined;
    if (!board) return null;
    const existing = per.get(board.id);
    if (existing) return existing;
    const fresh: MyWeekBoardSummary = {
      id: board.id,
      name: board.name,
      client: board.client_name,
      href: `/team/workboard?board=${board.id}`,
      open: 0,
      late: 0,
      doing: 0,
      done: 0,
      next: null,
    };
    per.set(board.id, fresh);
    return fresh;
  };
  for (const { card, row } of open) {
    const s = entry(card.board_id);
    if (!s) continue;
    s.open += 1;
    if (row.lateDays > 0) s.late += 1;
    if (row.doing) s.doing += 1;
    if (row.due && row.due >= today && (!s.next || row.due < s.next.due)) s.next = { title: row.title, due: row.due };
  }
  for (const card of done) {
    const s = entry(card.board_id);
    if (s) s.done += 1;
  }
  return [...per.values()].sort((a, b) => b.late - a.late || b.open - a.open || a.name.localeCompare(b.name));
}
