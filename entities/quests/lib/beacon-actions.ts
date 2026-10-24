"use server";

// Lighting a Beacon on the Quests page (QS.6; spec "Lighthouses"; the ladders
// spec's Beacon witness rule). One action, opened by the page's own atom,
// quests.mine, with the author read from the session, never from the page.
//
// It writes three rows of Quests' own, in this order:
//
// 1. the Beacon quest, with the reader as Giver and the link as lit_url, and
//    the held fire it grew from when it was lit from one;
// 2. its one head, because a party row answers a head (quest_party.head_id is
//    not null);
// 3. the reader's own party row, turned in with turn_in_url the same link.
//
// The banner counts the Beacon from the quest, and the ladders credit the
// person from the party row, so both hold the one link. The writes go through
// PostgREST one at a time and cannot share a transaction, so a failure after
// the first withdraws the Beacon (the undo Light it uses for a Raid): a
// withdrawn quest stands on no horizon and counts on no banner, and with no
// party row it credits nobody. Only if the withdraw fails too is anything left
// behind, and the server log names the row. No points are written here; the
// ladders hear of the Turn-in through their own replay. No view, like or
// reach is stored anywhere.
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import type { Result } from "@/kernel/data/result";
import { heldFireOf } from "./lighthouses-read";
import { BeaconInput, formRefusal, planBeacon, readOrRefuse, type BeaconOrigin } from "./quest-rules";
import { insertQuestHeads, insertQuestParty, insertQuests, updateQuests } from "./writes";

const WRITE_FAILED = "Could not light the Beacon. Try again.";
const READ_FAILED = "Could not read your fires. Try again.";
const NOT_HELD = "That fire was not held yet, or it has its Beacon already.";
const TAG = "[quests/beacons]";

/** What the form sends: what was put out, the link, and the held fire it grew from, if any. */
export type LightBeaconInput = { title: string; url: string; originQuestId?: string | null };

/**
 * Lights a Beacon for the reader. A Beacon lit from a held fire records the
 * fire, and the learning that fire grew from when it did; the fire must be
 * one the reader hosted, held, with no live Beacon yet, which is asked again
 * here rather than taken from the page.
 */
export async function lightBeacon(input: LightBeaconInput): Promise<Result & { questId?: string }> {
  await requirePermission("quests.mine");
  const actor = await requireTeamMember();
  const parsed = BeaconInput.safeParse(input);
  if (!parsed.success) return formRefusal(parsed.error.issues);
  const { title, url, originQuestId } = parsed.data;
  return readOrRefuse(
    async () => {
      const now = new Date();
      let origin: BeaconOrigin | null = null;
      if (originQuestId) {
        const fire = await heldFireOf(actor.personId, originQuestId, now);
        if (!fire) return { ok: false, error: NOT_HELD };
        origin = { questId: fire.questId, ideaId: fire.originIdeaId };
      }
      const plan = planBeacon({ title, url }, actor.personId, origin, now);

      const { data: quest, error: questError } = await insertQuests(plan.quest).select("id").single();
      if (questError || !quest) {
        console.error(`${TAG} quests insert`, questError?.message);
        return { ok: false, error: WRITE_FAILED };
      }
      const questId = (quest as { id: string }).id;
      const withdraw = async () => {
        const { error } = await updateQuests({ state: "withdrawn", withdrawn_at: now.toISOString(), closed_at: null }).eq("id", questId);
        if (error) console.error(`${TAG} could not withdraw half-lit Beacon ${questId}: ${error.message}`);
      };

      const { data: head, error: headError } = await insertQuestHeads([plan.head(questId)]).select("id").single();
      if (headError || !head) {
        console.error(`${TAG} quest_heads insert`, headError?.message);
        await withdraw();
        return { ok: false, error: WRITE_FAILED };
      }

      const { error: partyError } = await insertQuestParty([plan.party(questId, (head as { id: string }).id)]);
      if (partyError) {
        console.error(`${TAG} quest_party insert`, partyError.message);
        await withdraw();
        return { ok: false, error: WRITE_FAILED };
      }

      revalidatePath("/team/quests");
      return { ok: true, questId };
    },
    READ_FAILED,
    TAG,
  );
}
