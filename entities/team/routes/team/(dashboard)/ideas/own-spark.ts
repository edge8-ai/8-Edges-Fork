// The rules for what an author may do to their own spark (TH.4.6): fix a
// one-line spark's title, withdraw it, and put it back. Pure and browser-safe,
// so they are tested without a database and the controls can read the same
// constants; own-spark-actions.ts reads, checks and writes.
import type { SparkStatusChange } from "@/entities/team/lib/spark-reads";

// What a valid spark line is belongs to the ideas entity (lib/spark-line.ts),
// so the Quests page's Lore composer (QS.4) posts the same line Spark does.
// Posting one (quickSpark) and fixing one (renameSpark) read it from here.
export { SPARK_TITLE_MAX, cleanSparkTitle } from "@/entities/ideas/client";

/** The atom own-spark-actions.ts is declared under (entities/team/permissions.ts), for the controls' `may` (ADR 0014). */
export const OWN_SPARK_ATOM = "team.ideas";

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
