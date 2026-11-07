// Evolve's read (QS.7; spec "Evolve: an unlock on your own learning"): where
// each of the reader's own learnings in the Lore stands. Only the reader's own
// are asked about, so the page never carries an Evolve state for anyone else's
// learning, and the pill can only ever be drawn for its author.
//
// The quests that grew from a learning are Quests' own rows (origin_idea_id):
// the Raids the reader hosts and the Beacons they lit. Whether a fire was held
// is Training's to say, through the same door read the Lighthouses use
// (fireSessions). Every read raises on failure: a missing pill from a failed
// read would hide a fire the reader held.
//
// The Evolve action counts a learning's live fires through firesGrownFrom and
// evolve-model's liveFires too, so the page offers a fire exactly when the
// action would light one. It also takes the cold Raids from the same read, and
// puts them out before it lights, so QS.7b's index agrees with both (QS.7c).
import { mustRows } from "@/kernel/data/read";
import { coldFires, evolveOf, liveFires, type Evolve, type FireSession, type GrownQuest } from "./evolve-model";
import { fireSessions } from "./lighthouses-read";
import type { LoreEntry } from "./lore";
import type { RaidToPutOut } from "./put-out";
import { GROWN_COLUMNS, type GrownRow } from "./rows";
import { selectQuests } from "./reads";

const TAG = "[quests/evolve]";

/** The live (not withdrawn) Raids and Beacons grown from these learnings; grownQuest keeps the reader's own. */
async function grownFrom(ideaIds: readonly string[]): Promise<GrownRow[]> {
  return mustRows(
    await selectQuests(GROWN_COLUMNS)
      .in("origin_idea_id", [...ideaIds])
      .in("kind", ["raid", "beacon"])
      .neq("state", "withdrawn"),
    `${TAG} grown from learnings`,
  ) as unknown as GrownRow[];
}

/** One grown row as the pure rule takes it; a Raid counts only when the reader hosts it, a Beacon only when they lit it. */
function grownQuest(r: GrownRow, readerId: string): GrownQuest | null {
  if (r.kind === "raid") return r.host_id === readerId ? { id: r.id, kind: "raid", title: r.title, trainingId: r.training_id, createdAt: r.created_at } : null;
  if (r.kind === "beacon") return r.giver_id === readerId ? { id: r.id, kind: "beacon", title: r.title, trainingId: null, createdAt: r.created_at } : null;
  return null;
}

/** The reader's quests grown from these learnings, by learning id, and each Raid's session by its training id. */
async function firesGrownFrom(readerId: string, ideaIds: readonly string[]): Promise<{ grown: Map<string, GrownQuest[]>; sessions: Map<string, FireSession> }> {
  const rows = await grownFrom(ideaIds);
  const grown = new Map<string, GrownQuest[]>();
  for (const r of rows) {
    const q = grownQuest(r, readerId);
    if (q) grown.set(r.origin_idea_id, [...(grown.get(r.origin_idea_id) ?? []), q]);
  }
  const trainingIds = [...grown.values()].flat().flatMap((q) => (q.trainingId ? [q.trainingId] : []));
  return { grown, sessions: await fireSessions(trainingIds) };
}

/**
 * How many live fires the reader has on one learning, by the rule the page's
 * pill uses, and the cold Raids on it that Evolve puts out before it lights
 * (QS.7c). Every Raid the read finds is one or the other. A failed read raises.
 */
export async function firesOn(readerId: string, ideaId: string): Promise<{ live: number; cold: RaidToPutOut[] }> {
  const { grown, sessions } = await firesGrownFrom(readerId, [ideaId]);
  const fires = grown.get(ideaId) ?? [];
  // The read leaves out withdrawn quests and a Raid never closes, so every cold Raid here is open.
  return { live: liveFires(fires, sessions).length, cold: coldFires(fires, sessions).map((q) => ({ id: q.id, state: "open", trainingId: q.trainingId })) };
}

/** Each of the reader's own learnings among these entries that has an Evolve state, by the learning's id. */
export async function readEvolve(readerId: string, entries: readonly LoreEntry[], now: Date): Promise<Record<string, Evolve>> {
  const mine = entries.filter((e) => e.mine);
  if (mine.length === 0) return {};
  const { grown, sessions } = await firesGrownFrom(readerId, mine.map((e) => e.id));
  const out: Record<string, Evolve> = {};
  for (const e of mine) {
    const state = evolveOf(e.willTry, readerId, grown.get(e.id) ?? [], sessions, now);
    if (state) out[e.id] = state;
  }
  return out;
}
