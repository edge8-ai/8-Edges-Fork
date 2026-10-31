// The Lore section's words, game or plain (QS.4; Khoa's game style rule,
// 2026-10-21). Pure, beside plain-model.ts. With the game style on the section
// is the Lore and a learning shared drops its points where it landed, the
// first one as "Spark struck"; off, it is Learnings, the points are said
// plainly, and nothing drops. The points are the ladders' (a spark, 10), handed
// over by the learnShareStanding page slot (QS.13; ui/act-points.ts) so the
// table is written down once; with no ladders there are none to show, and the
// button and the line carry no number. Nothing here writes or counts them, and
// nothing here counts who has not shared or tried.

/** Spark's field, filtered to learnings: "Read all in Spark". */
export const SPARK_LEARNINGS_HREF = "/team/ideas?kind=learning";

export const LORE_EMPTY = "No learnings yet. Share the first thing you learned this week.";

export type LoreWords = {
  title: string;
  why: string;
  share: string;
  sharing: string;
  /** The art beside the heading: the game's only. */
  glyph: boolean;
};

/** The Lore's words; `points` is what a learning earns the reader, or null when the page has none to show. */
export function loreWords(game: boolean, points: number | null): LoreWords {
  const why = "What we learned, from Spark. Say you'll try one.";
  const share = points === null ? "Share" : game ? `Share · +${points}` : `Share · +${points} points`;
  return game ? { title: "The Lore", why, share, sharing: "Sharing…", glyph: true } : { title: "Learnings", why, share, sharing: "Sharing…", glyph: false };
}

/**
 * What shows under the composer once a learning lands. In the game style it
 * is a drop: the first spark a person ever posts is "Spark struck", the badge
 * the ladders give for it, and every later one is its points. Plain, it is a
 * quiet line, and "Spark struck" is never shown. With no points to show (no
 * ladders, so no badge either) it is a quiet "Shared." in both styles.
 */
export function sharedLine(game: boolean, points: number | null): { drop: boolean; text: string } {
  if (points === null) return { drop: false, text: "Shared." };
  if (!game) return { drop: false, text: `Shared · +${points} points` };
  return { drop: true, text: `+${points}` };
}

/** The will-try count on a learning: distinct people other than its author, never their names. */
export function willTryLine(n: number): string {
  return `${n} will try`;
}
