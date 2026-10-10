// Domains across every board (W.53), worked out from the cross-board workboard
// read. The page this feeds answers "what is open in Commerce & Billing"
// without picking a board first — the other half of W.37, which only fixed the
// filter.
//
// EPICS ARE BOARD-SCOPED (W.41). Two boards that each have a "Marketing" epic
// have two different domains, and nothing here is ever matched by name: a row
// is a (board, epic) pair and it always names its board.
//
// The figures were re-cut before this was built (Khoa, 2026-09-20: more data is
// not better, and a figure nobody acts on is noise). The original spec was 23
// domains times open / done / open HT / done HT with a column per board —
// several hundred integers, which is the thing the epics page rebuild exists to
// undo. What survived is the three things a person does something about: where
// the open work is, whether it is moving, and how long a domain that is not
// moving has been still. Cards and tokens only; no row is ever sliced by a
// person.

import { epicColorIndex } from "@/entities/boards/lib/types";
import type { EpicRow } from "@/entities/boards/lib/types";
import { epicTotals, zeroTotals } from "@/entities/boards/lib/epic-totals";
import type { EpicTotals } from "@/entities/boards/lib/epic-totals";

/** A domain counts as moving when a card in it changed column this recently. */
export const MOVING_DAYS = 7;

type DomainCard = {
  board_id: string | null;
  epic_id: string | null;
  status: string;
  human_tokens: number | null;
  last_moved_at: string;
};

type DomainBoard = { id: string; name: string; slug: string };

export type DomainRow = {
  /** (board, epic) — the identity of a domain, because a name alone is not one. */
  key: string;
  boardName: string;
  boardSlug: string;
  epicId: string;
  epicName: string;
  description: string | null;
  colorIndex: number;
  totals: EpicTotals;
  openTokens: number;
  /** Cards in this domain that changed column within MOVING_DAYS. */
  movedRecently: number;
  /** Whole days since the most recent move of an OPEN card, or null when none is open. */
  stillForDays: number | null;
};

export type DomainsModel = {
  /** Domains with open work, heaviest first — where the open work is. */
  open: DomainRow[];
  /** Domains whose cards are all done or that have none: nothing to act on now. */
  quiet: DomainRow[];
  openTokens: number;
  openCards: number;
  boards: number;
};

function daysSince(iso: string, now: number): number {
  return Math.floor((now - new Date(iso).getTime()) / 86_400_000);
}

export function domainRows(boards: DomainBoard[], epics: EpicRow[], cards: DomainCard[], now = Date.now()): DomainsModel {
  const byBoard = new Map(boards.map((b) => [b.id, b]));
  const cardsByBoard = new Map<string, DomainCard[]>();
  for (const card of cards) {
    if (!card.board_id) continue;
    const list = cardsByBoard.get(card.board_id);
    if (list) list.push(card);
    else cardsByBoard.set(card.board_id, [card]);
  }

  const rows: DomainRow[] = [];
  for (const epic of epics) {
    // An archived domain is not a place work is filed any more, and a domain on
    // a board outside this scope has no board to name — neither is a row.
    if (epic.status === "archived") continue;
    const board = byBoard.get(epic.board_id);
    if (!board) continue;

    const boardCards = cardsByBoard.get(epic.board_id) ?? [];
    const mine = boardCards.filter((c) => c.epic_id === epic.id);
    // epic-totals.ts is the tested, person-free counter and is not touched: it
    // is run per board exactly as the per-board epics page runs it.
    const { byEpic } = epicTotals(mine);
    const totals = byEpic.get(epic.id) ?? zeroTotals();

    const movedRecently = mine.filter((c) => daysSince(c.last_moved_at, now) < MOVING_DAYS).length;
    const openMoves = mine.filter((c) => c.status === "open").map((c) => daysSince(c.last_moved_at, now));
    rows.push({
      key: `${epic.board_id}:${epic.id}`,
      boardName: board.name,
      boardSlug: board.slug,
      epicId: epic.id,
      epicName: epic.name,
      description: epic.description,
      colorIndex: epicColorIndex(epic.color),
      totals,
      openTokens: totals.openTokens,
      movedRecently,
      stillForDays: openMoves.length > 0 ? Math.min(...openMoves) : null,
    });
  }

  // Heaviest open work first, then most open cards: an unsized domain with
  // fifteen open cards must not sort below a sized one with two.
  const open = rows
    .filter((r) => r.totals.open > 0)
    .sort((a, b) => b.openTokens - a.openTokens || b.totals.open - a.totals.open || a.epicName.localeCompare(b.epicName));
  const quiet = rows
    .filter((r) => r.totals.open === 0)
    .sort((a, b) => a.boardName.localeCompare(b.boardName) || a.epicName.localeCompare(b.epicName));

  return {
    open,
    quiet,
    openTokens: open.reduce((sum, r) => sum + r.openTokens, 0),
    openCards: open.reduce((sum, r) => sum + r.totals.open, 0),
    boards: new Set(open.map((r) => r.boardSlug)).size,
  };
}
