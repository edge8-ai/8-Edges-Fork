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
import { mustCount, mustPages, mustRows } from "@/kernel/data/read";
import { peopleOnRecord } from "@/kernel/identity/team-people";
import { sessionRegisters, taughtSessions } from "@/entities/training";
import type { FireSession } from "./evolve-model";
import { heldFiresOf, shapeLit, type HeldFire, type Lighthouses } from "./lighthouse-model";
import { BEACON_COLUMNS, HOSTED_RAID_COLUMNS, type BeaconRow, type HostedRaidRow } from "./rows";
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

/**
 * The one held fire a Beacon may be lit from: a Raid the reader hosts, held,
 * with no live Beacon grown from it yet. Null otherwise. The action asks it
 * again rather than trust the page, so a Beacon can only name a fire its own
 * author held.
 */
export async function heldFireOf(readerId: string, questId: string, now: Date): Promise<HeldFire | null> {
  const raids = mustRows(
    await selectQuests(HOSTED_RAID_COLUMNS).eq("id", questId).eq("kind", "raid").eq("host_id", readerId).neq("state", "withdrawn").not("training_id", "is", null).limit(1),
    `${TAG} fire`,
  ) as unknown as HostedRaidRow[];
  if (raids.length === 0) return null;
  const [sessions, lit] = await Promise.all([fireSessions(raids.map((r) => r.training_id)), litFrom([questId])]);
  return heldFiresOf(raids, readerId, sessions, lit, now)[0] ?? null;
}

/** The section for one reader: every lit Beacon on the horizon, their own held fires with no Beacon yet, and how many they have lit. */
export async function readLighthouses(readerId: string, now: Date = new Date()): Promise<Lighthouses> {
  // "Every one lit stands on this horizon": the read pages rather than caps, so
  // no Beacon drops off the far end unannounced.
  const [rows, mineRes, heldFires] = await Promise.all([
    mustPages<BeaconRow>(`${TAG} beacons`, (from, to) =>
      selectQuests(BEACON_COLUMNS).eq("kind", "beacon").not("lit_url", "is", null).neq("state", "withdrawn").order("created_at", { ascending: false }).order("id").range(from, to),
    ),
    selectQuests("id", { count: "exact", head: true }).eq("kind", "beacon").eq("giver_id", readerId).not("lit_url", "is", null).neq("state", "withdrawn"),
    readHeldFires(readerId, now),
  ]);
  const mine = mustCount(mineRes, `${TAG} beacons lit by the reader`);
  const people = await peopleOnRecord(rows.map((r) => r.giver_id));
  const names = new Map([...people].map(([id, p]) => [id, p.name]));
  return { lit: shapeLit(rows, names, readerId), heldFires, beacons: { lit: mine, canLight: true } };
}
