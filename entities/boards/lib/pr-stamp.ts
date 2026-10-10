// HTT's PR sync stated what it stored; this stamps the title and state of each
// PR on the cards that link it (W.161). Boards is portable and HTT internal, so
// Boards may not read htt.pull_requests: the fact on the bus is the seam Khoa
// chose (2026-10-05), and on a deployment without HTT nothing is ever stamped.
//
// The other direction runs on the bus too (F8). HTT re-states only the PRs
// that changed since its last sync, so a card linked to a PR that had already
// merged was never stamped. Setting a link now states `board.card.pr_linked`,
// and HTT answers with `pull_requests.synced` for that one PR when it has it.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { publish, type EventPayload } from "@/kernel/events";
import { cardPrStampCurrent, cardPrUrl, prKey, type CardPrSync } from "./types";
import { updateTasks } from "./writes";

type Synced = EventPayload<"pull_requests.synced">["pullRequests"][number];
type CardRow = { id: string; metadata: Record<string, unknown> | null; updated_at: string };

// Writes in flight at once. A nightly sync stamps a handful of cards; HTT's
// backfill can hand over hundreds of PRs, and one write at a time inside the
// sync's own request would run it long (739 cards linked a PR on 2026-10-05).
const WRITES_AT_ONCE = 8;

// PostgREST answers at most the project's max rows (1000 by default) per
// request, silently. 778 cards held a link on 2026-10-05, so one unpaged read
// was a few weeks from leaving every card past the thousandth unstamped (B6).
export const CARD_PAGE = 1000;

/**
 * Every card with a PR link, read a page at a time in id order until a short
 * page. Archived cards too, so a restored card is right. With `prNumber` the
 * read is narrowed to links whose text holds "/pull/<n>", which is what a link
 * just set asks for: one PR should not cost a read of every linked card. The
 * narrowing is a prefilter only; the caller still matches by `prKey`, so
 * "/pull/17810" passing the filter for 1781 is harmless.
 */
export async function readPrLinkedCards(opts: { prNumber?: number; after?: string } = {}): Promise<CardRow[]> {
  const cards: CardRow[] = [];
  for (let from = 0; ; from += CARD_PAGE) {
    let q = companyOs.from("tasks").select("id, metadata, updated_at").not("metadata->>pr_url", "is", null);
    if (opts.prNumber !== undefined) q = q.ilike("metadata->>pr_url", `%/pull/${opts.prNumber}%`);
    if (opts.after !== undefined) q = q.gt("id", opts.after);
    const page = mustRows(await q.order("id").range(from, from + CARD_PAGE - 1), "cards with a PR link") as CardRow[];
    cards.push(...page);
    if (page.length < CARD_PAGE) return cards;
  }
}

/**
 * The card's PR link as the fact carries it, or null when it names no GitHub
 * pull request. A link stored before W.116 can lack its scheme, and the fact
 * wants a URL, so one is supplied rather than the request refused.
 */
export function linkedPrUrl(metadata: Record<string, unknown> | null | undefined): string | null {
  const raw = cardPrUrl({ metadata: metadata ?? {} }).trim();
  if (!prKey(raw)) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/**
 * Asks for a stamp when a card's PR link was set or changed (F8). Nothing is
 * asked for a link that names no GitHub pull request, or when the link still
 * names the PR the card's stamp already describes.
 *
 * It runs after the card's own write has held, so it never fails the save: a
 * link the bus refuses as a URL (typed by hand, so it can be odd) is logged
 * and the card keeps its "PR #N" until the backfill or a sync asks again. A
 * listener's failure never reaches here at all; the bus keeps it.
 */
export async function announcePrLink(
  taskId: string,
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): Promise<void> {
  const url = linkedPrUrl(after);
  if (!url) return;
  const previous = { metadata: before ?? {} };
  if (prKey(cardPrUrl(previous)) === prKey(url) && cardPrStampCurrent(previous)) return;
  try {
    await publish("board.card.pr_linked", { taskId, prUrl: url });
  } catch (err) {
    console.error(`[boards/pr-stamp] could not ask for a stamp on ${taskId} (${url}):`, err instanceof Error ? err.message : String(err));
  }
}

type Due = { card: CardRow; metadata: Record<string, unknown>; stamp: CardPrSync; url: string };

/** The stamp a card should carry for one of the synced PRs, or null when it already does or links none of them. */
function stampDue(card: CardRow, byKey: Map<string, Synced>): Due | null {
  const metadata = card.metadata ?? {};
  const key = prKey(cardPrUrl({ metadata }));
  const pr = key ? byKey.get(key) : undefined;
  if (!key || !pr) return null;
  const stamp: CardPrSync = { key, title: pr.title, state: pr.state };
  const was = metadata["pr_synced"] as Partial<CardPrSync> | undefined;
  if (was && was.key === stamp.key && was.title === stamp.title && was.state === stamp.state) return null;
  return { card, metadata, stamp, url: pr.url };
}

/** The conditional write: lands only while the card is as it was read. Says how many rows it matched. */
async function writeStamp(due: Due): Promise<{ matched: number; error: string | null }> {
  const { data, error } = await updateTasks({ metadata: { ...due.metadata, pr_synced: due.stamp } })
    .eq("id", due.card.id)
    .eq("updated_at", due.card.updated_at)
    .select("id");
  if (error) return { matched: 0, error: error.message };
  return { matched: (data ?? []).length, error: null };
}

/**
 * Every card whose PR link names one of the synced PRs gets `pr_synced` set to
 * that PR's title and state. A card already carrying exactly that stamp is not
 * written again, so a nightly sync that re-reports an unchanged PR costs a
 * read and nothing else.
 *
 * Matching is by owner, repo and number (`prKey`), never by the URL as typed:
 * links typed with a trailing "/files", or before the org was renamed, still
 * name the same PR, and a repo name two owners share does not cross over.
 *
 * Each write is conditional on the card's `updated_at` being what was read,
 * so someone saving the card between the read and the write is not
 * overwritten with metadata from a moment ago. A write that matched no row
 * used to pass as a success, and since HTT's `last_synced_at` had already
 * moved on, nothing would ever state that PR again (B13). Now the card is read
 * once more and the stamp retried once against what it holds now; what still
 * does not land is counted and logged.
 */
export async function stampSyncedPullRequests(payload: EventPayload<"pull_requests.synced">): Promise<void> {
  const byKey = new Map<string, Synced>();
  for (const pr of payload.pullRequests) {
    const key = prKey(pr.url);
    if (key) byKey.set(key, pr);
  }
  if (byKey.size === 0) return;

  // One PR (a link just set, or a quiet nightly sync) narrows the read to the
  // links that could name it; several read every linked card.
  const only = byKey.size === 1 ? [...byKey.values()][0] : null;
  const cards = await readPrLinkedCards(only ? { prNumber: only.number } : {});

  // One card's refusal must not cost the others their stamp, so failures are
  // gathered and reported once, after every card has been tried; the bus logs
  // and audits what this throws.
  const failed: string[] = [];
  const lost: string[] = [];
  const due = cards.map((card) => stampDue(card, byKey)).filter((d): d is Due => d !== null);
  for (let i = 0; i < due.length; i += WRITES_AT_ONCE) {
    await Promise.all(
      due.slice(i, i + WRITES_AT_ONCE).map(async (d) => {
        const first = await writeStamp(d);
        if (first.error) return void failed.push(`${d.card.id} (${d.url}): ${first.error}`);
        if (first.matched > 0) return;
        // Saved in between: read what the card holds now and try once more.
        const { data: fresh, error: readErr } = await companyOs
          .from("tasks")
          .select("id, metadata, updated_at")
          .eq("id", d.card.id)
          .maybeSingle();
        if (readErr) return void failed.push(`${d.card.id} (${d.url}): ${readErr.message}`);
        // Deleted, relinked to another PR, or already stamped: nothing is owed.
        const again = fresh ? stampDue(fresh as CardRow, byKey) : null;
        if (!again) return;
        const second = await writeStamp(again);
        if (second.error) return void failed.push(`${d.card.id} (${d.url}): ${second.error}`);
        if (second.matched === 0) lost.push(`${d.card.id} (${d.url})`);
      }),
    );
  }
  if (lost.length > 0) {
    // Saved twice while this ran. Not an error anyone can act on, but a card
    // left unstamped is otherwise invisible, so it is said; the backfill
    // action asks again for any card whose stamp is not current.
    console.warn(`[boards/pr-stamp] ${lost.length} stamp(s) did not land after a retry: ${lost.join("; ")}`);
  }
  if (failed.length > 0) throw new Error(`could not stamp ${failed.length} card(s): ${failed.join("; ")}`);
}
