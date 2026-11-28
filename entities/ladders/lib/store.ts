// The three tables behind one small interface (LD.1), so the recompute, the
// replay and the two reads can be tested on rows in memory and run against
// Supabase without a line of difference. Every read raises on failure: a
// failed read of a person's unlocks would otherwise look like "no tier held",
// and a recompute on that answer could write a lower tier than the one held.
import { mustCount, mustPages, mustRows } from "@/kernel/data/read";
import { selectLadderDisplay, selectLadderPositions, selectLadderUnlocks } from "./reads";
import { DISPLAY_COLUMNS, POSITION_COLUMNS, UNLOCK_COLUMNS, type DisplayRow, type PositionInsert, type PositionRow, type UnlockInsert, type UnlockKind, type UnlockRow } from "./rows";
import { insertLadderUnlocks, upsertLadderPositions } from "./writes";

export type Store = {
  positionsOf(personIds: readonly string[]): Promise<PositionRow[]>;
  unlocksOf(personIds: readonly string[]): Promise<UnlockRow[]>;
  displayOf(personIds: readonly string[]): Promise<DisplayRow[]>;
  /** Everyone with a position or an unlock row: the replay's universe beyond the team of today. */
  peopleWithRows(): Promise<string[]>;
  /**
   * Whether anyone has ever been credited anything (or, given a kind, anything
   * of that kind): false means the next replay is the launch of it.
   */
  anyUnlock(kind?: UnlockKind): Promise<boolean>;
  /**
   * The company's totals for the rarity bands (LD.7b): how many people hold
   * each badge, and how many people the ladders know (everyone the replay has
   * given a position). Counts only, never who: the band is the one read
   * across people, and it names no one.
   */
  badgeHolders(): Promise<BadgeHolders>;
  writePositions(rows: PositionInsert[]): Promise<void>;
  /** Inserts the unlocks not yet there; one already there is left exactly as it is. */
  writeUnlocks(rows: UnlockInsert[]): Promise<void>;
};

/** How many people hold each badge, and how many people the ladders know. */
export type BadgeHolders = { holders: Map<string, number>; people: number };

/** One count per badge key: the unique (person, kind, key) on the table makes each unlock row one holder. */
export function countKeys(rows: readonly { key: string }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const { key } of rows) out.set(key, (out.get(key) ?? 0) + 1);
  return out;
}

const CHUNK = 100;

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

async function inChunks<R>(ids: readonly string[], read: (ids: string[]) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  for (const slice of chunks(ids)) out.push(...(await read(slice)));
  return out;
}

export const liveStore: Store = {
  positionsOf: (ids) => inChunks(ids, async (slice) => mustRows(await selectLadderPositions(POSITION_COLUMNS).in("person_id", slice), "[ladders] ladder_positions") as unknown as PositionRow[]),
  unlocksOf: (ids) => inChunks(ids, async (slice) => mustRows(await selectLadderUnlocks(UNLOCK_COLUMNS).in("person_id", slice), "[ladders] ladder_unlocks") as unknown as UnlockRow[]),
  displayOf: (ids) => inChunks(ids, async (slice) => mustRows(await selectLadderDisplay(DISPLAY_COLUMNS).in("person_id", slice), "[ladders] ladder_display") as unknown as DisplayRow[]),
  async peopleWithRows() {
    const [positions, unlocks] = await Promise.all([
      mustRows(await selectLadderPositions("person_id").limit(10_000), "[ladders] ladder_positions people") as unknown as { person_id: string }[],
      mustRows(await selectLadderUnlocks("person_id").limit(10_000), "[ladders] ladder_unlocks people") as unknown as { person_id: string }[],
    ]);
    return [...new Set([...positions, ...unlocks].map((r) => r.person_id))];
  },
  async anyUnlock(kind) {
    const query = selectLadderUnlocks("id", { head: true, count: "exact" });
    return mustCount(await (kind ? query.eq("kind", kind) : query), "[ladders] ladder_unlocks count") > 0;
  },
  async badgeHolders() {
    // Every page of the badge unlocks, in a fixed order: one request answers at
    // most PAGE_ROWS rows, and a single capped read would silently count too
    // few once the company holds more badges than that (the launch credit alone
    // can). The people are those with a Learn & Share position, one row each.
    const [keys, people] = await Promise.all([
      mustPages<{ key: string }>("[ladders] badge holders", (from, to) => selectLadderUnlocks("key").eq("kind", "badge").order("id").range(from, to)),
      mustCount(await selectLadderPositions("person_id", { head: true, count: "exact" }).eq("ladder", "learn_share"), "[ladders] people with a position"),
    ]);
    return { holders: countKeys(keys), people };
  },
  async writePositions(rows) {
    if (rows.length === 0) return;
    const { error } = await upsertLadderPositions(rows);
    if (error) throw new Error(`[ladders] ladder_positions upsert: ${error.message}`);
  },
  async writeUnlocks(rows) {
    if (rows.length === 0) return;
    const { error } = await insertLadderUnlocks(rows);
    if (error) throw new Error(`[ladders] ladder_unlocks insert: ${error.message}`);
  },
};
