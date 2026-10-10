// What My Week reads (W.169.1): one person's own cards, and only the boards
// those cards sit on.
//
// WHY THIS IS NOT getWorkboard. Until W.169 the page asked getWorkboard for
// scope "all" with an assignee, and that read loaded every task on every board
// in the company — with every board's columns, members, sprints, epics, staff
// and client contacts — and only then dropped other people's cards in
// JavaScript. Its cost grew with the company, not with the reader's work. Here
// the assignee filter is in SQL (tasks_assignee_idx), done cards are fetched
// only as far back as the rail's garden of past sprints reaches (W.173, six
// sprints), and the board reads name only the board ids the cards came back with.
//
// THE SELF-VIEW. The only person this file takes is the caller's guard's
// person id; it has no other argument that names anybody. "Waiting on you"
// does read other people's cards — the parents of blockers tagged to the
// reader — because a blocker that names you is yours to answer; their title
// and board are all the page shows of them.
//
// A failed read throws (mustRows). An empty answer here would render as "you
// have no work", which is a wrong answer rather than an acceptable fallback.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { addDays } from "@/kernel/config/dates";
import { selectCompanies } from "@/kernel/identity/reads";
import { railReadSince } from "./my-week-sprint";
import { BOARD_COLUMN_SELECT, BOARD_SELECT, SPRINT_SELECT, type BoardColumnRow, type BoardRow, type SprintRow, type TaskRow } from "./types";

const CARD_SELECT = "id, title, board_id, board_column_id, sprint_id, status, priority, due_date, human_tokens, completed_at, assignee_id, metadata";

export type MyWeekCard = Pick<
  TaskRow,
  "id" | "title" | "board_id" | "board_column_id" | "sprint_id" | "status" | "priority" | "due_date" | "human_tokens" | "completed_at" | "assignee_id" | "metadata"
>;

export type MyWeekBoard = BoardRow & { client_name: string | null; columns: BoardColumnRow[] };

/** An open blocker tagged to the reader, on an open card that is somebody else's. */
export type MyWeekBlocker = { id: string; title: string; blockedCard: MyWeekCard };

export type MyWeekRead = {
  boards: MyWeekBoard[];
  sprints: SprintRow[];
  /** The reader's top-level cards: every open one, and those done since the garden's first sprint. */
  cards: MyWeekCard[];
  blockers: MyWeekBlocker[];
};

/**
 * The reader's week, read. `sprintStart` is the first day of the sprint
 * window; finished work before it feeds only the garden. completed_at is an
 * instant and the window is a Saigon calendar, so the read starts a day early
 * and the model keeps what was finished on each window's business days.
 */
export async function readMyWeek(personId: string, sprintStart: string): Promise<MyWeekRead> {
  const doneSince = addDays(railReadSince(sprintStart), -1);
  const [cardRes, blockerRes] = await Promise.all([
    companyOs
      .from("tasks")
      .select(CARD_SELECT)
      .eq("assignee_id", personId)
      .is("parent_task_id", null)
      .is("archived_at", null)
      .or(`status.eq.open,and(status.eq.done,completed_at.gte.${doneSince})`),
    companyOs
      .from("tasks")
      .select("id, title, parent_task_id")
      .eq("assignee_id", personId)
      .eq("status", "open")
      .eq("metadata->>kind", "blocker")
      .not("parent_task_id", "is", null)
      .is("archived_at", null),
  ]);
  const cards = mustRows(cardRes, "[boards/my-week] tasks") as MyWeekCard[];
  const blockerRows = mustRows(blockerRes, "[boards/my-week] blockers") as { id: string; title: string; parent_task_id: string }[];

  // A blocker on your own card is a note to yourself, not somebody waiting on you.
  const parentIds = [...new Set(blockerRows.map((b) => b.parent_task_id))];
  const blockedCards = parentIds.length
    ? (mustRows(
        await companyOs.from("tasks").select(CARD_SELECT).in("id", parentIds).eq("status", "open").is("archived_at", null),
        "[boards/my-week] blocked cards",
      ) as MyWeekCard[]).filter((p) => p.assignee_id !== personId)
    : [];
  const blockedById = new Map(blockedCards.map((p) => [p.id, p]));
  const blockers: MyWeekBlocker[] = [];
  for (const b of blockerRows) {
    // A blocker whose card is closed, or is the reader's own, waits on nobody.
    const blockedCard = blockedById.get(b.parent_task_id);
    if (blockedCard) blockers.push({ id: b.id, title: b.title, blockedCard });
  }

  const boardIds = [...new Set([...cards, ...blockedCards].map((c) => c.board_id).filter((id): id is string => id !== null))];
  if (boardIds.length === 0) return { boards: [], sprints: [], cards, blockers };

  const boardRows = mustRows(
    await companyOs.from("boards").select(BOARD_SELECT).in("id", boardIds).is("archived_at", null),
    "[boards/my-week] boards",
  ) as BoardRow[];
  const liveIds = boardRows.map((b) => b.id);
  const clientIds = [...new Set(boardRows.map((b) => b.client_company_id).filter((id): id is string => id !== null))];
  const [columnRes, sprintRes, clientRes] = await Promise.all([
    companyOs.from("board_columns").select(BOARD_COLUMN_SELECT).in("board_id", liveIds).order("position"),
    companyOs.from("sprints").select(SPRINT_SELECT).in("board_id", liveIds),
    clientIds.length ? selectCompanies("id, name").in("id", clientIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const columns = mustRows(columnRes, "[boards/my-week] board_columns") as BoardColumnRow[];
  const sprints = mustRows(sprintRes, "[boards/my-week] sprints") as SprintRow[];
  const clientName = new Map((mustRows(clientRes, "[boards/my-week] companies") as { id: string; name: string }[]).map((c) => [c.id, c.name]));

  const boards: MyWeekBoard[] = boardRows.map((b) => ({
    ...b,
    client_name: b.client_company_id ? (clientName.get(b.client_company_id) ?? null) : null,
    columns: columns.filter((c) => c.board_id === b.id),
  }));
  return { boards, sprints, cards, blockers };
}
