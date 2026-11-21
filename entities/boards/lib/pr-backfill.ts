"use server";

// The one-off that asks for a stamp on every card whose PR link carries none
// that is current (F8). Cards linked before `board.card.pr_linked` existed
// were never asked for, and the stamps W.161 wrote carry the owner-less key.
//
// It is a bulk write in effect (every answered request stamps a card), so by
// CLAUDE.md it runs only after Khoa has said yes in chat. Nothing calls it: no
// cron, no page load, no button. It is exported from the boards door so an
// admin session can call it by hand, a batch at a time.
import { requirePermission } from "@/kernel/identity/access-request";
import { publish } from "@/kernel/events";
import { type Result } from "@/kernel/data/result";
import { linkedPrUrl, readPrLinkedCards } from "./pr-stamp";
import { cardPrStampCurrent } from "./types";

// At most this many requests per call, so one call stays well inside a server
// action's time and a person can watch the count fall between calls.
const PR_BACKFILL_BATCH = 100;

/**
 * Publishes `board.card.pr_linked` for up to 100 cards, in id order after
 * `after`, whose link names a GitHub pull request and whose stamp is missing,
 * of another PR, or in the owner-less form. Returns how many it requested and
 * the cursor for the next call, which is null once the last card was passed.
 * A card HTT has no row for is requested and stays unstamped, so the cursor,
 * not the count of what is left, is what moves the run forward.
 *
 * @public Called by hand from an admin session, never by code (see above).
 */
export async function requestMissingPrStamps(after?: string | null): Promise<Result & { requested?: number; next?: string | null }> {
  await requirePermission("boards.open");
  const cards = await readPrLinkedCards(after ? { after } : {});
  const owed: { id: string; url: string }[] = [];
  for (const c of cards) {
    const url = linkedPrUrl(c.metadata);
    if (url && !cardPrStampCurrent({ metadata: c.metadata ?? {} })) owed.push({ id: c.id, url });
  }
  const batch = owed.slice(0, PR_BACKFILL_BATCH);
  for (const c of batch) {
    await publish("board.card.pr_linked", { taskId: c.id, prUrl: c.url });
  }
  const next = owed.length > PR_BACKFILL_BATCH ? batch[batch.length - 1].id : null;
  return { ok: true, requested: batch.length, next };
}
