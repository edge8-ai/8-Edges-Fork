// The Lore as the Quests page draws it (QS.4; spec "The Lore is Spark's
// learnings" and "The Lore on the page"). Pure and browser-safe: the page's
// client components take these shapes as props, and lore-read.ts fills them
// from the Ideas door on the server. Each learning carries its author's face,
// the words, and how many people other than the author will try it; nobody
// who said so is named.
import type { Learning } from "@/entities/ideas";
import { initials } from "@/kernel/ui/format";
import type { Portrait } from "./party-picker";

/** One learning as the Quests page draws it. */
export type LoreEntry = {
  id: string;
  author: Portrait;
  /** The reader wrote it: "You", and no Will try. */
  mine: boolean;
  title: string;
  postedAt: string;
  willTry: number;
  youWillTry: boolean;
};

export type Lore = {
  entries: LoreEntry[];
  /** The reader has never posted a spark, so their next learning is their first ("Spark struck" in the game style). */
  firstSpark: boolean;
};

/** The empty Lore, for a page drawn with no database. */
export const NO_LORE: Lore = { entries: [], firstSpark: false };

/** One Ideas learning as a Lore entry, for this reader. */
export function loreEntry(l: Learning, readerId: string): LoreEntry {
  const mine = l.authorId === readerId;
  return {
    id: l.id,
    author: { personId: l.authorId, name: l.authorName, initials: initials(l.authorName) },
    mine,
    title: l.title,
    postedAt: l.postedAt,
    willTry: l.willTry,
    youWillTry: !mine && l.youWillTry,
  };
}
