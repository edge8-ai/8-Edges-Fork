// The Lore's read (QS.4): Spark's newest learnings, through the Ideas door.
// The Quests entity keeps no copy, and Ideas owns every row; the shapes the
// page draws are lore.ts's, which the browser may import and this file, which
// reaches the service-role client through the door, must not be.
import { readLearnings } from "@/entities/ideas";
import { readEvolve } from "./evolve-read";
import { loreEntry, type Lore } from "./lore";

/**
 * The newest learnings for one reader, and where each of their own stands for
 * Evolve (QS.7). A failed read raises, so the page errors rather than showing
 * an empty Lore or hiding a fire the reader held.
 */
export async function readLore(readerId: string, now: Date = new Date()): Promise<Lore> {
  const { learnings, readerHasSparked } = await readLearnings(readerId);
  const entries = learnings.map((l) => loreEntry(l, readerId));
  return { entries, firstSpark: !readerHasSparked, evolve: await readEvolve(readerId, entries, now) };
}
