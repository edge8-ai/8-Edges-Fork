import type { SocialChannel, SocialPostRow } from "./parse";

// Which of our planned posts an exported post is. None of our social rows
// records the published link, so the match is by channel, a publish date within
// a week, and how much of the post's wording the calendar copy shares. The
// week is wide on purpose: the first import (2026-10-15) showed posts going
// out up to two weeks from their calendar date, so the wording carries the
// match and the date only rules out the far past and future. A post that
// clears no candidate stays unmatched and the person links it by hand.

export const MATCH_WINDOW_DAYS = 7;

export type ContentCandidate = {
  id: string;
  channel: string;
  publishDate: string | null;
  text: string;
};

// Share of the exported post's distinct words that appear in the candidate's
// copy. Below this the two are different posts that went out the same day.
const MIN_OVERLAP = 0.5;

export function matchPost(
  channel: SocialChannel,
  post: Pick<SocialPostRow, "kind" | "postedOn" | "text">,
  candidates: ContentCandidate[],
): string | null {
  if (post.kind === "job" || !post.postedOn) return null;
  const words = wordSet(post.text);
  if (words.size === 0) return null;

  let best: { id: string; score: number } | null = null;
  for (const c of candidates) {
    if (c.channel !== channel || !c.publishDate || dayGap(c.publishDate, post.postedOn) > MATCH_WINDOW_DAYS) continue;
    const theirs = wordSet(c.text);
    let shared = 0;
    for (const w of words) if (theirs.has(w)) shared += 1;
    const score = shared / words.size;
    if (score >= MIN_OVERLAP && (!best || score > best.score)) best = { id: c.id, score };
  }
  return best?.id ?? null;
}

function wordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2),
  );
}

function dayGap(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}
