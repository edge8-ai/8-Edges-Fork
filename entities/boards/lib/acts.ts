// Whose done card it is, for the ladders (LD.1; ADR 0021): the cards a
// person is credited for, as the board keeps them. The ladders ask for them
// through shippedCardFactsOf (act-facts.ts), with what the points and the
// badges ask of each; the rule that makes a card worth points is
// entities/ladders/lib/badge-acts.ts and points.ts, and the board totals nobody.
//
// Who a card is credited to. The spec names the card's assignee. On the board
// a subtask may carry no assignee of its own and belong to its parent's (the
// drawer shows the parent's name on it; 81 of 1,240 done subtasks on
// 2026-10-21), so a card is credited to its own assignee, or to its parent's
// when it has none. A card with no assignee anywhere is credited to nobody.
// The points and the badges read the same cards (A.77), so they never
// disagree on whose card it is.
//
// Batched by person, chunked to keep each request's URL short, and paged
// because PostgREST answers at most a thousand rows a request and the board
// holds more done cards than that.
import { mustPages, mustRows } from "@/kernel/data/read";
import { DONE_STATUS } from "./card-stage";
import { selectTasks } from "./reads";

const CHUNK = 100;

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

export type DoneRow = { id: string; assignee_id: string | null; parent_task_id: string | null; status: string; completed_at: string | null; archived_at: string | null; human_tokens: number | null };

/**
 * Each person's done, unarchived cards, own and inherited, with the columns
 * asked for (which must include those of DoneRow). Only people asked about
 * are credited.
 */
export async function creditedDoneCards<R extends DoneRow>(personIds: readonly string[], columns: string): Promise<{ personId: string; row: R }[]> {
  const asked = new Set(personIds);
  const credited: { personId: string; row: R }[] = [];
  for (const ids of chunks(personIds)) {
    const own = await mustPages<R>("[boards/acts] own done cards", (from, to) =>
      selectTasks(columns).in("assignee_id", ids).eq("status", DONE_STATUS).is("archived_at", null).order("id").range(from, to),
    );
    for (const row of own) credited.push({ personId: row.assignee_id as string, row });
  }
  // Done subtasks with no assignee of their own belong to their parent's.
  const orphans = await mustPages<R>("[boards/acts] unassigned done subtasks", (from, to) =>
    selectTasks(columns).is("assignee_id", null).not("parent_task_id", "is", null).eq("status", DONE_STATUS).is("archived_at", null).order("id").range(from, to),
  );
  if (orphans.length > 0) {
    const parentIds = [...new Set(orphans.map((o) => o.parent_task_id as string))];
    const parents = new Map<string, string | null>();
    for (const ids of chunks(parentIds)) {
      const rows = mustRows(await selectTasks("id, assignee_id").in("id", ids), "[boards/acts] parents of unassigned subtasks") as unknown as { id: string; assignee_id: string | null }[];
      for (const p of rows) parents.set(p.id, p.assignee_id);
    }
    for (const row of orphans) {
      const personId = parents.get(row.parent_task_id as string) ?? null;
      if (personId && asked.has(personId)) credited.push({ personId, row });
    }
  }
  return credited;
}
