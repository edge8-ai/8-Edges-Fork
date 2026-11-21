// The Lighthouses read (QS.6; spec "Lighthouses", "What the page never
// shows"). Lit Beacons are Quests' own rows. Whether a fire the reader hosted
// was held is Training's to say: its session's end and cancellation come from
// taughtSessions and who attended from sessionRegisters, both through the
// Training door, because the register is Training's (ADR 0016) and Quests never
// reads a training table.
//
// Every read raises on failure: an empty horizon from a failed read would tell
// the reader nobody has carried anything outside, and a missing offer would
// hide a fire they held.
import { mustRows } from "@/kernel/data/read";
import { sessionRegisters, taughtSessions } from "@/entities/training";
import type { FireSession } from "./evolve-model";
import { heldFiresOf, type HeldFire } from "./lighthouse-model";
import { HOSTED_RAID_COLUMNS, type HostedRaidRow } from "./rows";
import { selectQuests } from "./reads";

const TAG = "[quests/lighthouses]";
/** More Beacons than a horizon could ever stand; the newest are kept. */
/** The reader's newest Raids; a fire held long ago and never lit as a Beacon still offers it until it falls past this. */
const RAID_LIMIT = 100;

/** Each session asked about, as the held rule needs it, from the Training door's two reads. The Lore's Evolve read, the ladders' facts and the quest clock ask it too (QS.7, ADR 0023). */
export async function fireSessions(trainingIds: readonly string[]): Promise<Map<string, FireSession>> {
  if (trainingIds.length === 0) return new Map();
  const [sessions, registers] = await Promise.all([taughtSessions(trainingIds), sessionRegisters(trainingIds)]);
  const out = new Map<string, FireSession>();
  for (const [id, s] of sessions) {
    const register = registers.get(id);
    out.set(id, { endsAt: s.endsAt, cancelled: s.cancelled, selfLogged: register?.selfLogged ?? false, attended: register?.attended ?? [] });
  }
  return out;
}

/** The fires among these that a live Beacon already grew from. */
async function litFrom(raidIds: readonly string[]): Promise<Set<string>> {
  if (raidIds.length === 0) return new Set();
  const rows = mustRows(await selectQuests("origin_quest_id").eq("kind", "beacon").neq("state", "withdrawn").in("origin_quest_id", [...raidIds]), `${TAG} lit from`) as unknown as {
    origin_quest_id: string;
  }[];
  return new Set(rows.map((r) => r.origin_quest_id));
}

/** The reader's held fires with no Beacon yet. The assistant's open quests read them too (QS.9). */
export async function readHeldFires(readerId: string, now: Date): Promise<HeldFire[]> {
  const raids = mustRows(
    await selectQuests(HOSTED_RAID_COLUMNS)
      .eq("kind", "raid")
      .eq("host_id", readerId)
      .neq("state", "withdrawn")
      .not("training_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(RAID_LIMIT),
    `${TAG} hosted raids`,
  ) as unknown as HostedRaidRow[];
  if (raids.length === 0) return [];
  const [sessions, lit] = await Promise.all([fireSessions(raids.map((r) => r.training_id)), litFrom(raids.map((r) => r.id))]);
  return heldFiresOf(raids, readerId, sessions, lit, now);
}

