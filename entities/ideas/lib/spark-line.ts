// What a valid spark line is (TH.4.6), owned by the entity that owns sparks.
// Pure and browser-safe, so Spark's composer, the rename on a spark's page and
// the Quests page's Lore composer (QS.4) all read one rule: a spark posted
// from either page is the same line.

/** The longest line a spark takes, everywhere one is written or edited. */
export const SPARK_TITLE_MAX = 200;

/**
 * A spark's line as it is stored: one line, trimmed, at most SPARK_TITLE_MAX.
 * Posting one and fixing one both pass through it, so the two can never
 * disagree on what a valid line is; `tooLong` lets a composer add its own hint
 * about where the rest goes.
 */
export function cleanSparkTitle(raw: string): { ok: true; title: string } | { ok: false; error: string; tooLong: boolean } {
  const title = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!title) return { ok: false, error: "Write one line first. That is all a spark needs.", tooLong: false };
  if (title.length > SPARK_TITLE_MAX) return { ok: false, error: "Keep a spark to one line, under 200 characters.", tooLong: true };
  return { ok: true, title };
}
