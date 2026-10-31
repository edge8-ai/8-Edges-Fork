"use server";

// Evolve on the Quests page (QS.7; spec "Evolve: an unlock on your own
// learning", "Access and gates for version 10"): a learning three people will
// try becomes its author's fire. One action, opened by the page's own atom,
// quests.mine, with the reader read from the session, never from the page.
//
// The page offers the pill only on the reader's own learning at three will
// try, but a page can be stale or forged, so the action reads the learning
// again through the Ideas door (its author and its count of distinct others)
// and the live fires already lit from it, by the same read and rule the
// page's pill uses (evolve-read's firesOn), and asks evolve-model's one
// rule. A reader can never evolve someone else's learning; they raise a Hand
// instead.
//
// A Raid left open on a cancelled session is no live fire to the page, but
// QS.7b's one-fire index still counts it: the cancel puts it out through a
// soft event handler, which can fail and only log. So before it lights, the
// action puts out every cold Raid on the learning by Quests' own rule for a
// fire that never happens (put-out.ts), and the fire the page offers is one
// the database takes (QS.7c). Nothing is put out for a refused fire.
//
// Lighting is the Light it move's (light-raid.ts): the Training session
// through its door with the author as its organiser, which makes them
// organiser of that one session and never widens training.organise, then the
// Raid with the learning as origin_idea_id. Nothing is sent to anyone: no notification, no message, no
// line. No points are written here; the ladders credit a held fire from the
// register (LD.2). Lighting the Beacon later is lightBeacon's (QS.6), which
// reads the learning back from the fire, and the Host's notes on what they
// taught are a learning they share through the Lore's own composer action.
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import type { Result } from "@/kernel/data/result";
import { learningOf } from "@/entities/ideas";
import { planEvolveFire } from "./evolve-model";
import { firesOn } from "./evolve-read";
import { lightRaid } from "./light-raid";
import { putOutRaid } from "./put-out";
import { EvolveInput, parseError, readOrRefuse } from "./quest-rules";

const READ_FAILED = "Could not read your learning. Try again.";
const WRITE_FAILED = "Could not save that. Try again.";
const TAG = "[quests/evolve]";

/**
 * Hosts a twenty-minute fire on the reader's own learning at the time they
 * chose: a Raid with the learning's title, the reader as Host and Giver, its
 * Training session, and origin_idea_id the learning. Refused for anyone but
 * the author, under three will try, for a learning that already has a live
 * fire, and for a time that has passed.
 */
export async function hostFireOnLearning(ideaId: string, startsAt: string): Promise<Result & { questId?: string }> {
  await requirePermission("quests.mine");
  const actor = await requireTeamMember();
  const parsed = EvolveInput.safeParse({ ideaId, startsAt });
  if (!parsed.success) return parseError(parsed.error.issues);
  const { ideaId: id, startsAt: at } = parsed.data;
  return readOrRefuse(
    async () => {
      const now = new Date();
      const [learning, fires] = await Promise.all([learningOf(id), firesOn(actor.personId, id)]);
      const plan = planEvolveFire(learning, actor.personId, fires.live, at, now);
      if (!plan.ok) return plan;
      try {
        for (const cold of fires.cold) await putOutRaid(cold, now);
      } catch (e) {
        console.error(TAG, e instanceof Error ? e.message : e);
        return { ok: false, error: WRITE_FAILED };
      }
      const raid = await lightRaid({ hostId: actor.personId, title: plan.title, startsAt: at, originIdeaId: id }, now);
      if (!raid.ok) return raid;
      revalidatePath("/team/quests");
      return { ok: true, questId: raid.questId };
    },
    READ_FAILED,
    TAG,
  );
}
