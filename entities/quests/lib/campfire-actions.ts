"use server";

// Campfires' moves on the Quests page (QS.5; spec "Wanted fires: hands",
// "Burning fires and seats", "Access and gates for version 10"): raise and
// lower a hand, light a cold fire, and take or leave a seat by a burning one.
// Each opens with the page's own atom, quests.mine, then reads who is asking.
//
// A hand is Quests' own row. A Raid's session and its register are Training's,
// so lighting a fire and taking a seat go through the Training door's commands
// (ADR 0018), with the reader as the session's organiser: the person who
// lights a fire runs that one session and no other, and training.organise is
// never widened (ADR 0013). No points are written here; a fire held is the
// ladders' to credit, from the register (LD.2).
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { mustRows } from "@/kernel/data/read";
import type { Result } from "@/kernel/data/result";
import { leaveSeat as leaveRegister, organisesSession, takeSeat as sitOnRegister } from "@/entities/training";
import { planFire } from "./campfires-model";
import { lightRaid } from "./light-raid";
import { Id, LightInput, Topic, TopicKey, parseError, readOrRefuse } from "./quest-rules";
import { HAND_COLUMNS, RAID_COLUMNS, type HandRow, type LitRaidRow } from "./rows";
import { selectQuestHands, selectQuests } from "./reads";
import { deleteQuestHands, insertQuestHands, updateQuestHands } from "./writes";

const WRITE_FAILED = "Could not save that. Try again.";
const READ_FAILED = "Could not read the campfires. Try again.";
const NOT_A_FIRE = "That fire was not found.";
const TAG = "[quests/campfires]";

/** Where a hand, a fire or a seat shows: the Quests page, and a seat on the person's own training list. */
function revalidateCampfires(seat = false): void {
  revalidatePath("/team/quests");
  if (seat) revalidatePath("/team/my-training");
}

/**
 * Raises the reader's hand for a topic. A line whose topic matches one
 * already wanted joins it (the database's topic key decides); raising a hand
 * already up is a no-op.
 */
export async function raiseHand(topic: string): Promise<Result> {
  await requirePermission("quests.mine");
  const actor = await requireTeamMember();
  const parsed = Topic.safeParse(topic);
  if (!parsed.success) return parseError(parsed.error.issues);
  const { error } = await insertQuestHands({ person_id: actor.personId, topic: parsed.data });
  // One hand per person per wanted topic: the unique index is the last word.
  if (error && error.code !== "23505") {
    console.error(`${TAG} quest_hands insert`, error.message);
    return { ok: false, error: WRITE_FAILED };
  }
  revalidateCampfires();
  return { ok: true };
}

/** Lowers the reader's own hand on a wanted topic. The row goes: nothing keeps a wish taken back. */
export async function lowerHand(topicKey: string): Promise<Result> {
  await requirePermission("quests.mine");
  const actor = await requireTeamMember();
  const parsed = TopicKey.safeParse(topicKey);
  if (!parsed.success) return parseError(parsed.error.issues);
  const { error } = await deleteQuestHands().eq("person_id", actor.personId).eq("topic_key", parsed.data).is("quest_id", null);
  if (error) {
    console.error(`${TAG} quest_hands delete`, error.message);
    return { ok: false, error: WRITE_FAILED };
  }
  revalidateCampfires();
  return { ok: true };
}

/**
 * Lights a cold fire: the reader hosts its twenty minutes at the time they
 * chose. Refused below three hands. The three writes cannot share one
 * transaction, because the session is Training's and is written through its
 * door, so they run in the order that leaves the least behind:
 *
 * 1. the Training session, with the reader as its organiser;
 * 2. the Raid, carrying that session's id;
 * 3. quest_id on the topic's wanted hands, which takes the topic out of Wanted.
 *
 * A failure at 2 cancels the session (soft, as Training ends every session),
 * so nothing shows anywhere. A failure at 3, or finding no wanted hand left
 * because someone lit the same fire a moment earlier, withdraws the Raid and
 * cancels the session, so the topic stays wanted and no second fire burns.
 * Only if those undo writes fail too is anything left behind; the next render
 * then shows a burning fire with the reader as Host while the topic is still
 * wanted, and the server log names the rows.
 */
export async function lightFire(topicKey: string, startsAt: string): Promise<Result & { questId?: string }> {
  await requirePermission("quests.mine");
  const actor = await requireTeamMember();
  const parsed = LightInput.safeParse({ topicKey, startsAt });
  if (!parsed.success) return parseError(parsed.error.issues);
  const { topicKey: key, startsAt: at } = parsed.data;
  return readOrRefuse(
    async () => {
      const now = new Date();
      const hands = mustRows(await selectQuestHands(HAND_COLUMNS).eq("topic_key", key).is("quest_id", null), `${TAG} hands`) as unknown as HandRow[];
      const plan = planFire(hands, at, now);
      if (!plan.ok) return plan;

      // Steps 1 and 2 are light-raid.ts's, shared with Evolve (QS.7).
      const raid = await lightRaid({ hostId: actor.personId, title: plan.title, startsAt: at }, now);
      if (!raid.ok) return raid;
      const { questId } = raid;

      const { data: lit, error: handError } = await updateQuestHands({ quest_id: questId }).eq("topic_key", key).is("quest_id", null).select("id");
      if (handError || (lit ?? []).length === 0) {
        if (handError) console.error(`${TAG} quest_hands light`, handError.message);
        await raid.undo();
        return { ok: false, error: handError ? WRITE_FAILED : "Someone lit this fire a moment ago." };
      }

      revalidateCampfires();
      return { ok: true, questId };
    },
    READ_FAILED,
    TAG,
  );
}

/** A lit Raid, open, with its session; null when there is no such fire. A failed read raises. */
async function loadFire(questId: string): Promise<LitRaidRow | null> {
  const rows = mustRows(
    await selectQuests(RAID_COLUMNS).eq("id", questId).eq("kind", "raid").eq("state", "open").not("training_id", "is", null).limit(1),
    `${TAG} fire`,
  ) as unknown as LitRaidRow[];
  return rows[0] ?? null;
}

/**
 * Takes a seat by a burning fire: the reader's own row on its session's
 * register, pending. The person who runs the session is its Host, not a seat,
 * which Training's per-session organiser check answers.
 */
export async function takeSeat(questId: string): Promise<Result> {
  await requirePermission("quests.mine");
  const actor = await requireTeamMember();
  const qid = Id.safeParse(questId);
  if (!qid.success) return parseError(qid.error.issues);
  return readOrRefuse(
    async () => {
      const fire = await loadFire(qid.data);
      if (!fire) return { ok: false, error: NOT_A_FIRE };
      if (await organisesSession(actor.personId, fire.training_id)) return { ok: false, error: "You host this fire." };
      const r = await sitOnRegister(fire.training_id, actor.personId);
      if (!r.ok) return r;
      revalidateCampfires(true);
      return { ok: true };
    },
    READ_FAILED,
    TAG,
  );
}

/** Leaves the reader's seat: their pending row on the register goes. */
export async function leaveSeat(questId: string): Promise<Result> {
  await requirePermission("quests.mine");
  const actor = await requireTeamMember();
  const qid = Id.safeParse(questId);
  if (!qid.success) return parseError(qid.error.issues);
  return readOrRefuse(
    async () => {
      const fire = await loadFire(qid.data);
      if (!fire) return { ok: false, error: NOT_A_FIRE };
      const r = await leaveRegister(fire.training_id, actor.personId);
      if (!r.ok) return r;
      revalidateCampfires(true);
      return { ok: true };
    },
    READ_FAILED,
    TAG,
  );
}
