// A second question for the ladders (LD.7; ADR 0021; the badge catalogue,
// docs/engineering/2026-10-21-ladders-badges.md): the cards a person shipped,
// as the board keeps them, with what the badges found by doing ask of each.
// The same cards the points credit (creditedDoneCards: own, or a parent's
// when a subtask has no assignee), each with its size, its place (board,
// epic, sprint, parent), what it carries (a linked pull request, the spark it
// was picked up from, the card it unblocks, a confirmed deliverable), how
// many live children it has and how many of them are still open, whether its
// sprint has a goal written, whether its epic still has open cards, whether it
// once came back out of a Done column, and who else shipped a sibling subtask.
// And, asked separately, the done cards picked up from a set of sparks, so a
// spark's author can be told someone built it.
//
// What is never asked: a card set aside (not doing), a due date, or how long
// anything took. Children and epics are counted as open or not, nothing else.
// The board says what the cards are; what they are worth is the ladders'
// rule, and the board totals nobody.
//
// Batched by person, chunked to keep each request's URL short, and paged
// because PostgREST answers at most a thousand rows a request.
import { companyOs } from "@/kernel/data/supabase";
import { mustPagesIn } from "@/kernel/data/read";
import { creditedDoneCards, type DoneRow } from "./acts";
import { DONE_STATUS, OPEN_STATUS } from "./card-stage";
import { selectBoardColumns, selectTasks } from "./reads";

export type ShippedCardFact = {
  id: string;
  /** The card's own assignee; null when it is credited through its parent's. */
  assigneeId: string | null;
  humanTokens: number | null;
  status: string;
  completedAt: string | null;
  archivedAt: string | null;
  /** Unarchived children, any status. */
  liveChildren: number;
  /** Unarchived children still open. */
  openChildren: number;
  parentId: string | null;
  boardId: string | null;
  epicId: string | null;
  sprintId: string | null;
  subjectType: string | null;
  title: string;
  /** A pull request is linked (metadata.pr_url). */
  prLinked: boolean;
  /** The spark it was picked up from (metadata.idea_id), or null. */
  ideaId: string | null;
  /** It names the card it unblocks (metadata.blocked_by_task_id). */
  unblocks: boolean;
  /** It carries a confirmed, unarchived deliverable (a file or a link). */
  deliverable: boolean;
  /** Its sprint has a goal written. */
  sprintHasGoal: boolean;
  /** Its epic has an unarchived card still open; null when it has no epic. */
  epicHasOpenCards: boolean | null;
  /** It was once moved from a Done column back into the work. */
  backFromDone: boolean;
  /** The other people whose done sibling subtask shares its parent. */
  siblingShippedBy: string[];
  at: string;
};

/** A done card picked up from a spark, and who it is assigned to. */
export type SparkCardFact = { id: string; ideaId: string; assigneeId: string | null; at: string };

type FactRow = DoneRow & { board_id: string | null; epic_id: string | null; sprint_id: string | null; subject_type: string | null; title: string; metadata: Record<string, unknown> | null; updated_at: string };

const FACT_COLUMNS = "id, assignee_id, parent_task_id, status, completed_at, archived_at, human_tokens, board_id, epic_id, sprint_id, subject_type, title, metadata, updated_at";

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Each person's shipped cards with what the badges ask of them; a person with none gets an empty list. */
export async function shippedCardFactsOf(personIds: readonly string[]): Promise<Map<string, ShippedCardFact[]>> {
  const out = new Map<string, ShippedCardFact[]>(personIds.map((id) => [id, []]));
  if (personIds.length === 0) return out;
  const credited = await creditedDoneCards<FactRow>(personIds, FACT_COLUMNS);
  if (credited.length === 0) return out;
  const cardIds = [...new Set(credited.map((c) => c.row.id))];
  const parentIds = [...new Set(credited.map((c) => c.row.parent_task_id).filter((id): id is string => id !== null))];
  const epicIds = [...new Set(credited.map((c) => c.row.epic_id).filter((id): id is string => id !== null))];
  const sprintIds = [...new Set(credited.map((c) => c.row.sprint_id).filter((id): id is string => id !== null))];
  const [children, openInEpics, sprints, attachments, moves, siblings] = await Promise.all([
    mustPagesIn<{ parent_task_id: string; status: string }>(cardIds, "[boards/act-facts] children", (ids, from, to) =>
      selectTasks("id, parent_task_id, status").in("parent_task_id", ids).is("archived_at", null).order("id").range(from, to),
    ),
    mustPagesIn<{ epic_id: string }>(epicIds, "[boards/act-facts] open cards in epics", (ids, from, to) =>
      selectTasks("id, epic_id").in("epic_id", ids).eq("status", OPEN_STATUS).is("archived_at", null).order("id").range(from, to),
    ),
    mustPagesIn<{ id: string; goal: string | null }>(sprintIds, "[boards/act-facts] sprints", (ids, from, to) => companyOs.from("sprints").select("id, goal").in("id", ids).order("id").range(from, to)),
    mustPagesIn<{ task_id: string }>(cardIds, "[boards/act-facts] deliverables", (ids, from, to) =>
      companyOs.from("task_attachments").select("id, task_id").in("task_id", ids).is("archived_at", null).not("confirmed_at", "is", null).order("id").range(from, to),
    ),
    mustPagesIn<{ task_id: string; from_column_id: string; to_column_id: string }>(cardIds, "[boards/act-facts] column moves", (ids, from, to) =>
      companyOs.from("task_stage_log").select("id, task_id, from_column_id, to_column_id").in("task_id", ids).not("from_column_id", "is", null).not("to_column_id", "is", null).order("id").range(from, to),
    ),
    mustPagesIn<{ id: string; parent_task_id: string; assignee_id: string | null }>(parentIds, "[boards/act-facts] done siblings", (ids, from, to) =>
      selectTasks("id, parent_task_id, assignee_id").in("parent_task_id", ids).eq("status", DONE_STATUS).order("id").range(from, to),
    ),
  ]);
  const columnIds = [...new Set(moves.flatMap((m) => [m.from_column_id, m.to_column_id]))];
  const columns = await mustPagesIn<{ id: string; is_done: boolean }>(columnIds, "[boards/act-facts] columns moved between", (ids, from, to) =>
    selectBoardColumns("id, is_done").in("id", ids).order("id").range(from, to),
  );
  const doneColumn = new Map(columns.map((c) => [c.id, c.is_done]));

  const live = new Map<string, number>();
  const open = new Map<string, number>();
  for (const c of children) {
    live.set(c.parent_task_id, (live.get(c.parent_task_id) ?? 0) + 1);
    if (c.status === OPEN_STATUS) open.set(c.parent_task_id, (open.get(c.parent_task_id) ?? 0) + 1);
  }
  const epicsOpen = new Set(openInEpics.map((t) => t.epic_id));
  const goals = new Set(sprints.filter((s) => (s.goal ?? "").trim().length > 0).map((s) => s.id));
  const delivered = new Set(attachments.map((a) => a.task_id));
  const cameBack = new Set(moves.filter((m) => doneColumn.get(m.from_column_id) === true && doneColumn.get(m.to_column_id) === false).map((m) => m.task_id));

  for (const { personId, row } of credited) {
    const meta = row.metadata ?? {};
    out.get(personId)?.push({
      id: row.id,
      assigneeId: row.assignee_id,
      humanTokens: row.human_tokens,
      status: row.status,
      completedAt: row.completed_at,
      archivedAt: row.archived_at,
      liveChildren: live.get(row.id) ?? 0,
      openChildren: open.get(row.id) ?? 0,
      parentId: row.parent_task_id,
      boardId: row.board_id,
      epicId: row.epic_id,
      sprintId: row.sprint_id,
      subjectType: row.subject_type,
      title: row.title,
      prLinked: "pr_url" in meta,
      ideaId: text(meta.idea_id),
      unblocks: "blocked_by_task_id" in meta,
      deliverable: delivered.has(row.id),
      sprintHasGoal: row.sprint_id !== null && goals.has(row.sprint_id),
      epicHasOpenCards: row.epic_id === null ? null : epicsOpen.has(row.epic_id),
      backFromDone: cameBack.has(row.id),
      siblingShippedBy: [
        ...new Set(
          siblings
            .filter((s) => row.parent_task_id !== null && s.parent_task_id === row.parent_task_id && s.id !== row.id && s.assignee_id !== null && s.assignee_id !== personId)
            .map((s) => s.assignee_id as string),
        ),
      ],
      at: row.completed_at ?? row.updated_at,
    });
  }
  return out;
}

/** The done, unarchived cards picked up from the sparks named, with each card's assignee. */
export async function cardsFromSparks(ideaIds: readonly string[]): Promise<SparkCardFact[]> {
  if (ideaIds.length === 0) return [];
  const rows = await mustPagesIn<{ id: string; assignee_id: string | null; completed_at: string | null; updated_at: string; metadata: Record<string, unknown> | null }>(
    [...new Set(ideaIds)],
    "[boards/act-facts] cards from sparks",
    (ids, from, to) => selectTasks("id, assignee_id, completed_at, updated_at, metadata").in("metadata->>idea_id", ids).eq("status", DONE_STATUS).is("archived_at", null).order("id").range(from, to),
  );
  return rows.flatMap((r) => {
    const ideaId = text(r.metadata?.idea_id);
    return ideaId ? [{ id: r.id, ideaId, assigneeId: r.assignee_id, at: r.completed_at ?? r.updated_at }] : [];
  });
}
