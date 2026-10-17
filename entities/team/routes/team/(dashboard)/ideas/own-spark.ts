// The rules for what an author may do to their own spark (TH.4.6): fix a
// one-line spark's title, withdraw it, and put it back. Pure and browser-safe,
// so they are tested without a database and the controls can read the same
// constants; own-spark-actions.ts reads, checks and writes.
import type { SparkStatusChange } from "@/entities/team/lib/spark-reads";

/** The longest line a spark takes, everywhere one is written or edited. */
export const SPARK_TITLE_MAX = 200;

/** The atom own-spark-actions.ts is declared under (entities/team/permissions.ts), for the controls' `may` (ADR 0014). */
export const OWN_SPARK_ATOM = "team.ideas";

/**
 * A spark's line as it is stored: one line, trimmed, at most SPARK_TITLE_MAX.
 * Posting one (quickSpark) and fixing one (renameSpark) both pass through it,
 * so the two can never disagree on what a valid line is; `tooLong` lets the
 * composer add its own hint about where the rest goes.
 */
export function cleanSparkTitle(raw: string): { ok: true; title: string } | { ok: false; error: string; tooLong: boolean } {
  const title = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!title) return { ok: false, error: "Write one line first. That is all a spark needs.", tooLong: false };
  if (title.length > SPARK_TITLE_MAX) return { ok: false, error: "Keep a spark to one line, under 200 characters.", tooLong: true };
  return { ok: true, title };
}

/**
 * Why a spark cannot be withdrawn, or null when it can. A card picked up from
 * it, still on the board or already landed, is work someone took on with the
 * author's name on it, so the spark stays up; a card set aside is not.
 */
export function withdrawRefusal(cards: { status: string }[]): string | null {
  return cards.some((c) => c.status !== "not_doing")
    ? "A teammate has this spark on the Workboard, so it stays up while the card is there."
    : null;
}

export type { SparkStatusChange };

/** The status a put-back returns the spark to: the one it had when it was withdrawn. */
export function statusAfterPutBack(last: SparkStatusChange): string {
  return last.previous && last.previous !== "archived" ? last.previous : "new";
}

/**
 * Whether the author may put a spark back. Only their own withdrawal can be
 * undone: if the latest status change is an admin's (an archive from the
 * innovation shelf, or anything after the withdrawal), the spark stays where
 * the admin left it.
 */
export function mayPutBack(last: SparkStatusChange | null, personId: string): last is SparkStatusChange {
  return last !== null && last.status === "archived" && last.withdrawnBy === personId;
}
