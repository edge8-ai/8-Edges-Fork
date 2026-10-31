// Quests' one rule for a fire that never happens (QS.5c, QS.7c): the Raid is
// withdrawn, so it leaves Burning and no Beacon or fire is ever offered from
// it, and the topic stays wanted, so the hands on it go back to the topic with
// their people. A person who raised a new hand on the same topic since keeps
// that one, and their old hand stays with the withdrawn Raid: one hand per
// person per wanted topic is the table's own rule.
//
// Two callers put a Raid out. The cancel of its Training session does, through
// the bus (subscriptions.ts). Evolve does too, before it lights a fire on a
// learning, for any Raid still open on a session that was cancelled: the bus
// is soft, so its withdraw can fail and only be logged, and a Raid it left open
// would hold QS.7b's one-fire index while the page offers the fire again.
//
// Run twice, it writes nothing new: the Raid is withdrawn only while open, and
// only hands still on it are handed back. A run whose hand write failed is
// completed by the next, since a withdrawn Raid's hands are still looked for.
import { mustRows } from "@/kernel/data/read";
import { selectQuestHands } from "./reads";
import { updateQuestHands, updateQuests } from "./writes";

const TAG = "[quests/put-out]";

type HeldHand = { id: string; person_id: string; topic_key: string };

/** Hands a Raid's hands back to its topic, but never a second wanted hand for one person. A failed write raises. */
async function handBack(raidId: string): Promise<void> {
  const held = mustRows(await selectQuestHands("id, person_id, topic_key").eq("quest_id", raidId), `${TAG} hands on ${raidId}`) as unknown as HeldHand[];
  if (held.length === 0) return;
  const topics = [...new Set(held.map((h) => h.topic_key))];
  const wanted = mustRows(await selectQuestHands("person_id, topic_key").is("quest_id", null).in("topic_key", topics), `${TAG} wanted hands`) as unknown as Omit<HeldHand, "id">[];
  const already = new Set(wanted.map((w) => `${w.person_id} ${w.topic_key}`));
  for (const h of held.filter((h) => !already.has(`${h.person_id} ${h.topic_key}`))) {
    const { error } = await updateQuestHands({ quest_id: null }).eq("id", h.id).eq("quest_id", raidId);
    // A hand raised again between the read and this write is the table's to keep; this one stays with the Raid.
    if (error && error.code !== "23505") throw new Error(`${TAG} could not hand back hand ${h.id} of Raid ${raidId}: ${error.message}`);
  }
}

/** A Raid as putting it out needs it: its state, and its session for the error a failed write raises. */
export type RaidToPutOut = { id: string; state: string; trainingId: string | null };

/** Puts one Raid out: withdrawn while open, then its hands handed back. A failed read or write raises. */
export async function putOutRaid(raid: RaidToPutOut, now: Date): Promise<void> {
  if (raid.state === "open") {
    const { error } = await updateQuests({ state: "withdrawn", withdrawn_at: now.toISOString() }).eq("id", raid.id).eq("state", "open");
    if (error) throw new Error(`${TAG} could not put out Raid ${raid.id} of session ${raid.trainingId ?? "none"}: ${error.message}`);
  }
  await handBack(raid.id);
}
