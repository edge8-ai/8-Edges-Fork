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
//
// The event alone is not enough (Z.22). HTT's sync moves an `updatedAt`
// cursor, so a merged PR is named in exactly one event, and a card passed by
// that night for an open subtask was never looked at again: one client card
// sat in Doing for eleven days with all ten subtasks done. Subtasks are mostly
// ticked in SQL, which publishes nothing, so no tick event can be relied on
// either. The card already carries the fact that its PR merged (the stamp
// pr-stamp.ts writes), so a daily routine (crons/merged-pr-cards.ts) reads the
// stamps instead and lands what the event had to leave: the same landing, the
// same move row, the same `pr_done` mark.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { EventPayload } from "@/kernel/events";
import { CARD_PAGE } from "./pr-stamp";
import { landCardAsSystem } from "./system-moves";
import { cardPrSync, cardPrUrl, prKey, type CardPrSync } from "./types";
import { OPEN_STATUS } from "./card-stage";

type OpenCard = { id: string; board_id: string; metadata: Record<string, unknown> | null };
/** A card to land, the PR that finishes it, and that PR's key as the card links it now. */
type Due = { card: OpenCard; metadata: Record<string, unknown>; key: string; pr: { number: number; title: string } };

/**
 * The open, top-level, unarchived cards with a PR link, narrowed to one PR's
 * number, or to the cards whose stamp says merged, when asked.
 */
async function readOpenLinkedCards(narrow: { prNumber?: number; stampedMerged?: boolean } = {}): Promise<OpenCard[]> {
  const cards: OpenCard[] = [];
  for (let from = 0; ; from += CARD_PAGE) {
    let q = companyOs
      .from("tasks")
      .select("id, board_id, metadata")
      .eq("status", OPEN_STATUS)
      .is("archived_at", null)
      .is("parent_task_id", null)
      .not("metadata->>pr_url", "is", null);
    if (narrow.prNumber !== undefined) q = q.ilike("metadata->>pr_url", `%/pull/${narrow.prNumber}%`);
    if (narrow.stampedMerged) q = q.eq("metadata->pr_synced->>state", "merged");
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
    await companyOs.from("tasks").select("parent_task_id").in("parent_task_id", ids).eq("status", OPEN_STATUS).is("archived_at", null),
    "the cards' open children",
  ) as { parent_task_id: string }[];
  return new Set(rows.map((r) => r.parent_task_id));
}

/** What one pass did: cards landed, cards left for an open child, and the cards it could not land. */
export type LandingReport = { landed: number; waiting: number; failed: string[] };

/**
 * Land each due card in its board's Done column, unless it still has an open
 * child. One card's refusal must not cost the others their landing, so
 * failures are gathered for the caller to report once.
 */
async function landDue(due: Due[]): Promise<LandingReport> {
  const report: LandingReport = { landed: 0, waiting: 0, failed: [] };
  if (due.length === 0) return report;
  const [columns, busy] = await Promise.all([
    doneColumns([...new Set(due.map((d) => d.card.board_id))]),
    withOpenChildren(due.map((d) => d.card.id)),
  ]);
  for (const d of due) {
    if (busy.has(d.card.id)) {
      report.waiting += 1;
      continue;
    }
    const done = columns.get(d.card.board_id);
    if (!done) {
      report.failed.push(`${d.card.id}: its board has no Done column`);
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
    if (landed.ok) report.landed += 1;
    else report.failed.push(`${d.card.id} (${d.key}): ${landed.error}`);
  }
  return report;
}

export async function landCardsForMergedPullRequests(payload: EventPayload<"pull_requests.synced">): Promise<void> {
  const merged = new Map<string, { number: number; title: string }>();
  for (const pr of payload.pullRequests) {
    const key = pr.state === "merged" ? prKey(pr.url) : null;
    if (key) merged.set(key, pr);
  }
  if (merged.size === 0) return;

  const only = merged.size === 1 ? [...merged.values()][0] : null;
  const due = (await readOpenLinkedCards({ prNumber: only?.number })).flatMap((card): Due[] => {
    const metadata = card.metadata ?? {};
    const key = prKey(cardPrUrl({ metadata }));
    const pr = key ? merged.get(key) : undefined;
    if (!key || !pr || metadata["pr_done"] === key) return [];
    return [{ card, metadata, key, pr }];
  });
  // Thrown once, for the bus to log, audit and record.
  const { failed } = await landDue(due);
  if (failed.length > 0) throw new Error(`could not land ${failed.length} card(s) for a merged PR: ${failed.join("; ")}`);
}

/**
 * Z.22: land every open card whose own stamp says its PR merged, which the
 * night's event passed by because a subtask or blocker was still open then.
 * The stamp must describe the card's current link (cardPrSync), so a card
 * relinked to another PR waits for that PR's own state. A card already landed
 * for this PR and moved back by a person keeps the person's answer, exactly as
 * on the event's path.
 */
export async function landCardsWithMergedStamps(): Promise<LandingReport> {
  const due = (await readOpenLinkedCards({ stampedMerged: true })).flatMap((card): Due[] => {
    const metadata = card.metadata ?? {};
    const stamp = cardPrSync({ metadata });
    const key = prKey(cardPrUrl({ metadata }));
    const number = Number(key?.split("#")[1]);
    if (!key || stamp?.state !== "merged" || metadata["pr_done"] === key || !Number.isInteger(number)) return [];
    return [{ card, metadata, key, pr: { number, title: stamp.title } }];
  });
  return landDue(due);
}
