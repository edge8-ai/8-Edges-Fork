// The Light it move's two writes, shared by every way a fire is lit (QS.5's cold fire,
// QS.7's Evolve on a learning): the Training session through its door, with
// the Host as its organiser, then the Raid carrying that session's id, and the
// learning it grew from when Evolve lit it. Not a "use server" file, so this
// helper is never an endpoint of its own: the actions that call it open with
// their own guard and read who is asking from the session.
//
// The two writes cannot share a transaction, because the session is
// Training's. A failed Raid cancels the session (soft, as Training ends every
// session), so nothing shows anywhere. The caller gets an undo for a later
// step of its own that fails: it withdraws the Raid and cancels the session.
//
// Training's door can raise as well as refuse (its read of the session type
// raises on failure). A raise is a write that did not happen, so it comes back
// as the same "could not save" a refusal would, never as the caller's message
// for a failed read, and no Raid is written without its session.
//
// A Raid evolved from a learning meets QS.7b's partial unique index
// (migration 20261027140000): one live fire per learning. Evolve counts the
// live fires before it lights, so two submits at the same instant can both
// count zero; the index refuses the second Raid, and its session is cancelled
// like any failed Raid's, so the second submit leaves nothing behind. The
// index's name is matched, not just the code, so no other unique rule on
// quests is ever reported as this one. A cold fire carries no learning and
// never meets it.
import { cancelTaughtSession, createTaughtSession } from "@/entities/training";
import { FIRE_MINUTES } from "./campfires-model";
import { planRaid } from "./quest-rules";
import { insertQuests, updateQuests } from "./writes";

const WRITE_FAILED = "Could not save that. Try again.";
const LIT_ALREADY = "You lit a fire on this learning already.";
const ONE_FIRE_PER_LEARNING = "quests_one_live_fire_per_learning_idx";
const TAG = "[quests/light]";

export type LitRaid = { ok: true; questId: string; undo: () => Promise<void> } | { ok: false; error: string };

/** Lights a twenty-minute fire: its session, then its Raid, with the Host as Giver and Host. */
export async function lightRaid(fire: { hostId: string; title: string; startsAt: string; originIdeaId?: string | null }, now: Date): Promise<LitRaid> {
  let session: Awaited<ReturnType<typeof createTaughtSession>>;
  try {
    session = await createTaughtSession({ hostPersonId: fire.hostId, title: fire.title, startsAt: fire.startsAt, minutes: FIRE_MINUTES }, now);
  } catch (e) {
    console.error(`${TAG} training session`, e instanceof Error ? e.message : e);
    return { ok: false, error: WRITE_FAILED };
  }
  if (!session.ok) return session;
  const sessionId = session.id;
  const undoSession = async () => {
    try {
      const undone = await cancelTaughtSession(fire.hostId, sessionId, now);
      if (!undone.ok) console.error(`${TAG} could not cancel half-lit session ${sessionId}: ${undone.error}`);
    } catch (e) {
      console.error(`${TAG} could not cancel half-lit session ${sessionId}:`, e instanceof Error ? e.message : e);
    }
  };

  const { data: raid, error: raidError } = await insertQuests(planRaid(fire.title, fire.hostId, sessionId, fire.originIdeaId ?? null)).select("id").single();
  if (raidError?.code === "23505" && raidError.message.includes(ONE_FIRE_PER_LEARNING)) {
    await undoSession();
    return { ok: false, error: LIT_ALREADY };
  }
  if (raidError || !raid) {
    console.error(`${TAG} quests insert`, raidError?.message);
    await undoSession();
    return { ok: false, error: WRITE_FAILED };
  }
  const questId = (raid as { id: string }).id;
  const undo = async () => {
    const { error } = await updateQuests({ state: "withdrawn", withdrawn_at: now.toISOString() }).eq("id", questId);
    if (error) console.error(`${TAG} could not withdraw half-lit Raid ${questId}: ${error.message}`);
    await undoSession();
  };
  return { ok: true, questId, undo };
}
