// The owner's own badge facts, for the Achievements tab (LD.7b; spec "The
// profile page"; ADR 0021 "Who reads what"). The locked tiles say "You have 7.
// This one is found at 10.", which needs the reader's act facts, and the found
// tiles a band, which needs the company's per-badge totals. This read gathers
// both for the reader alone: it takes the reader and their standing, already
// read behind ladders.mine, and never a subject id, so it cannot be asked about
// anyone else. It is not on the door; only the owner's profile calls it.
//
// It is its own read rather than a wider myStanding because every other caller
// of myStanding (the rank-up gate on every team page, the next move on Quests,
// the drops) would then pay four door reads per render for counts it never
// shows. Either half may fail on its own: the tab then draws without counts or
// without bands, which is less than it could show and never a wrong number.
import { ReadFailure } from "@/kernel/data/read";
import { gatherActFacts, type PersonActFacts } from "./act-facts";
import { liveDoors, type Doors } from "./acts";
import type { Reader, Standing } from "./standing";
import { liveStore, type BadgeHolders, type Store } from "./store";

export type BadgeFacts = { facts: PersonActFacts | null; totals: BadgeHolders | null };

async function orNull<T>(read: () => Promise<T>, what: string): Promise<T | null> {
  try {
    return await read();
  } catch (err) {
    if (!(err instanceof ReadFailure)) throw err;
    console.error(`[ladders] ${what}:`, err.message);
    return null;
  }
}

/** The reader's own act facts and the company's per-badge totals; null for a half that could not be read. */
export async function myBadgeFacts(reader: Reader, standing: Standing, deps: { doors?: Doors; store?: Store } = {}): Promise<BadgeFacts> {
  const doors = deps.doors ?? liveDoors();
  const store = deps.store ?? liveStore;
  // The crossover badges read the ladders as the recompute left them: the points and the tiers held.
  const ladders = new Map([[reader.personId, { learnSharePoints: standing.learnShare.points, builderPoints: standing.builder.points, learnShare: standing.learnShare.tier, builder: standing.builder.tier }]]);
  const [facts, totals] = await Promise.all([
    orNull(async () => (await gatherActFacts([reader.personId], doors, ladders)).get(reader.personId) ?? null, "own badge facts"),
    orNull(() => store.badgeHolders(), "badge holders"),
  ]);
  return { facts, totals };
}
