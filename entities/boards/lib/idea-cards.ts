// Cards picked up from a spark on /team/ideas (ID.2.8). The link lives in the
// card's own metadata (metadata.idea_id), so the board owns it and no column
// was added to tasks. Two reads: the cards behind a set of sparks, and the
// boards a person may pick a spark up onto, each with the column a new card
// lands in. Both raise on failure: a failed read must not say "nobody picked
// this up", which would offer a second pick-up of the same spark.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { NAME_ONLY_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { saigonToday } from "@/kernel/config/dates";
import { memberBoardIds } from "./access";

export type IdeaCard = {
  ideaId: string;
  taskId: string;
  title: string;
  status: string;
  boardSlug: string;
  /** The board and the column the card sits in, for "Doing on 8 Edges" on the spark page (W.186). */
  boardName: string;
  columnName: string | null;
  /** Who has the card: the person who picked the spark up (ID.2, What came back). */
  assigneeId: string | null;
  assigneeName: string | null;
  createdAt: string;
  completedAt: string | null;
};

export async function cardsForIdeas(ideaIds: string[]): Promise<IdeaCard[]> {
  if (ideaIds.length === 0) return [];
  const rows = mustRows(
    await companyOs
      .from("tasks")
      .select(`id, title, status, assignee_id, metadata, created_at, completed_at, boards:boards!board_id(slug, name), board_columns:board_columns!board_column_id(name), people:people!assignee_id(${NAME_ONLY_COLUMNS})`)
      .in("metadata->>idea_id", ideaIds)
      .is("archived_at", null)
      .is("parent_task_id", null),
    "[boards] cards picked up from ideas",
  ) as unknown as {
    id: string;
    title: string;
    status: string;
    assignee_id: string | null;
    metadata: { idea_id?: string } | null;
    created_at: string;
    completed_at: string | null;
    boards: { slug: string; name: string } | { slug: string; name: string }[] | null;
    board_columns: { name: string } | { name: string }[] | null;
    people: NamedPerson | NamedPerson[] | null;
  }[];
  return rows.flatMap((r) => {
    const ideaId = r.metadata?.idea_id;
    const board = Array.isArray(r.boards) ? r.boards[0] : r.boards;
    const person = Array.isArray(r.people) ? r.people[0] : r.people;
    const column = Array.isArray(r.board_columns) ? r.board_columns[0] : r.board_columns;
    return ideaId && board
      ? [{ ideaId, taskId: r.id, title: r.title, status: r.status, boardSlug: board.slug, boardName: board.name, columnName: column?.name ?? null, assigneeId: r.assignee_id, assigneeName: person ? personName(person) : null, createdAt: r.created_at, completedAt: r.completed_at }]
      : [];
  });
}

export type PickableBoard = { id: string; slug: string; name: string; columnId: string; sprintId: string | null };

type SprintRow = { id: string; board_id: string; starts_on: string | null; ends_on: string | null };

// The sprint a picked-up card joins: the active one that holds today, else the
// earliest active one. A board can have two active sprints while the next one
// is planned, and the card belongs in the week being worked.
export function currentSprintFor(sprints: SprintRow[], today: string): string | null {
  const holding = sprints.find((s) => (s.starts_on ?? "") <= today && today <= (s.ends_on ?? "9999-12-31"));
  return (holding ?? sprints[0])?.id ?? null;
}

// The boards a person works on, each with its first open column (the lowest
// position that is neither done nor not-doing) and its current sprint. A board
// without an open column is left out, because a picked-up spark must not land
// already finished. The board where the person holds the most open cards comes
// first, so the picker opens on their main board.
//
// Admins get their own boards too (W.184): offering every active board put
// thirty client boards in front of the one they work on, with the first of
// them, a client's, preselected. An admin on no board still gets
// every active board, so the button is never a dead end for them.
export async function pickableBoards(actor: { personId: string; teamMemberId: string; isAdmin: boolean }): Promise<PickableBoard[]> {
  const ids = await memberBoardIds(actor.personId, actor.teamMemberId);
  if (ids.length === 0 && !actor.isAdmin) return [];
  let boardsQuery = companyOs.from("boards").select("id, slug, name").eq("status", "active").is("archived_at", null).order("sort_order");
  if (ids.length > 0) boardsQuery = boardsQuery.in("id", ids);
  const boards = mustRows(await boardsQuery, "[boards] pickable boards") as { id: string; slug: string; name: string }[];
  if (boards.length === 0) return [];
  const boardIds = boards.map((b) => b.id);
  const [columnsRes, sprintsRes, mineRes] = await Promise.all([
    companyOs
      .from("board_columns")
      .select("id, board_id, position, is_done, is_not_doing")
      .in("board_id", boardIds)
      .eq("is_done", false)
      .eq("is_not_doing", false)
      .order("position"),
    companyOs.from("sprints").select("id, board_id, starts_on, ends_on").in("board_id", boardIds).eq("status", "active").order("starts_on"),
    companyOs
      .from("tasks")
      .select("board_id")
      .in("board_id", boardIds)
      .eq("assignee_id", actor.personId)
      .is("archived_at", null)
      .not("status", "in", "(done,not_doing)"),
  ]);
  const columns = mustRows(columnsRes, "[boards] pickable board columns") as { id: string; board_id: string }[];
  const sprints = mustRows(sprintsRes, "[boards] pickable board sprints") as SprintRow[];
  const mine = mustRows(mineRes, "[boards] pickable board open cards") as { board_id: string }[];

  const first = new Map<string, string>();
  for (const c of columns) if (!first.has(c.board_id)) first.set(c.board_id, c.id);
  const open = new Map<string, number>();
  for (const t of mine) open.set(t.board_id, (open.get(t.board_id) ?? 0) + 1);
  const today = saigonToday();
  return boards
    .flatMap((b) =>
      first.has(b.id)
        ? [{ ...b, columnId: first.get(b.id)!, sprintId: currentSprintFor(sprints.filter((s) => s.board_id === b.id), today) }]
        : [],
    )
    .sort((a, b) => (open.get(b.id) ?? 0) - (open.get(a.id) ?? 0));
}
