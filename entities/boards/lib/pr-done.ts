// A merged pull request finishes the card that links it (Z.16, plan E3).
//
// HTT's PR sync states `pull_requests.synced` with each PR's state, and Boards
// already stamps that state on the cards that link it (pr-stamp.ts). This is
// the second answer to the same fact: when a PR in it is merged, an open card
// linking it lands in its board's Done column, through the same landing as a
// drag (system-moves.ts), so the stage log, the audit row, the children and
// `board.card.completed` are what a person's move would have produced. Human
// Tokens are left alone: a size is read from the shape of the work, never
// from the fact that it merged.
//
// Three cards are left where they are, because a merge does not prove them
// finished. A card with open subtasks or blockers has work the PR did not
// cover, and landing it would tick them all. A subtask is ticked by a person
// on its parent. And a card this already landed once for this PR, which a
// person has since moved back, keeps the person's answer: the `pr_done` mark
// names the PR, so a later sync of the same PR (the backfill re-states every
// one) passes it by.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { EventPayload } from "@/kernel/events";
import { CARD_PAGE } from "./pr-stamp";
import { landCardAsSystem } from "./system-moves";
import { cardPrUrl, prKey, type CardPrSync } from "./types";

type Synced = EventPayload<"pull_requests.synced">["pullRequests"][number];
type OpenCard = { id: string; board_id: string; metadata: Record<string, unknown> | null };

/** The open, top-level, unarchived cards with a PR link, narrowed to one PR's number when given. */
async function readOpenLinkedCards(prNumber?: number): Promise<OpenCard[]> {
  const cards: OpenCard[] = [];
  for (let from = 0; ; from += CARD_PAGE) {
    let q = companyOs
      .from("tasks")
      .select("id, board_id, metadata")
      .eq("status", "open")
      .is("archived_at", null)
      .is("parent_task_id", null)
      .not("metadata->>pr_url", "is", null);
    if (prNumber !== undefined) q = q.ilike("metadata->>pr_url", `%/pull/${prNumber}%`);
    const page = mustRows(await q.order("id").range(from, from + CARD_PAGE - 1), "open cards with a PR link") as OpenCard[];
    cards.push(...page);
    if (page.length < CARD_PAGE) return cards;
  }
}

/** Each board's Done column: the first done column by position. */
async function doneColumns(boardIds: string[]): Promise<Map<string, string>> {
  const rows = mustRows(
    await companyOs
      .from("board_columns")
      .select("id, board_id, position")
      .in("board_id", boardIds)
      .eq("is_done", true)
      .order("position"),
    "the boards' Done columns",
  ) as { id: string; board_id: string }[];
  const byBoard = new Map<string, string>();
  for (const r of rows) if (!byBoard.has(r.board_id)) byBoard.set(r.board_id, r.id);
  return byBoard;
}

/** The cards among `ids` that still have an open child (a subtask or a blocker). */
async function withOpenChildren(ids: string[]): Promise<Set<string>> {
  const rows = mustRows(
    await companyOs.from("tasks").select("parent_task_id").in("parent_task_id", ids).eq("status", "open").is("archived_at", null),
    "the cards' open children",
  ) as { parent_task_id: string }[];
  return new Set(rows.map((r) => r.parent_task_id));
}

export async function landCardsForMergedPullRequests(payload: EventPayload<"pull_requests.synced">): Promise<void> {
  const merged = new Map<string, Synced>();
  for (const pr of payload.pullRequests) {
    const key = pr.state === "merged" ? prKey(pr.url) : null;
    if (key) merged.set(key, pr);
  }
  if (merged.size === 0) return;

  const only = merged.size === 1 ? [...merged.values()][0] : null;
  const due = (await readOpenLinkedCards(only?.number)).flatMap((card) => {
    const metadata = card.metadata ?? {};
    const key = prKey(cardPrUrl({ metadata }));
    const pr = key ? merged.get(key) : undefined;
    if (!key || !pr || metadata["pr_done"] === key) return [];
    return [{ card, metadata, key, pr }];
  });
  if (due.length === 0) return;

  const [columns, busy] = await Promise.all([
    doneColumns([...new Set(due.map((d) => d.card.board_id))]),
    withOpenChildren(due.map((d) => d.card.id)),
  ]);

  // One card's refusal must not cost the others their landing; failures are
  // gathered and thrown once, for the bus to log, audit and record.
  const failed: string[] = [];
  for (const d of due) {
    if (busy.has(d.card.id)) continue;
    const done = columns.get(d.card.board_id);
    if (!done) {
      failed.push(`${d.card.id}: its board has no Done column`);
      continue;
    }
    // The stamp is written with the landing, so a stamp written by the other
    // subscriber in between is not lost to this card's older metadata.
    const stamp: CardPrSync = { key: d.key, title: d.pr.title, state: "merged" };
    const landed = await landCardAsSystem({
      taskId: d.card.id,
      toColumnId: done,
      label: `GitHub: PR #${d.pr.number} merged`,
      also: { metadata: { ...d.metadata, pr_synced: stamp, pr_done: d.key } },
    });
    if (!landed.ok) failed.push(`${d.card.id} (${d.pr.url}): ${landed.error}`);
  }
  if (failed.length > 0) throw new Error(`could not land ${failed.length} card(s) for a merged PR: ${failed.join("; ")}`);
}
