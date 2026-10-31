// What the composition root registers when quests is installed (QS.5c): a
// Raid's session cancelled through Training puts the Raid out. Training may not
// import Quests (quests requires training), so Training states the cancel on
// the bus and this listens. app/events.ts calls subscriptions(); nothing else
// does. A handler failure is the bus's to log and audit, and never reaches the
// organiser who cancelled.
//
// - training.session.cancelled: the Raid whose session it was, hosted by the
//   organiser who cancelled it, goes out by Quests' own rule for a fire that
//   never happens (put-out.ts). Any other Raid is left as it is; a session
//   that is no Raid's touches nothing.
// - Delivered twice, it writes nothing new (put-out.ts says why). A delivery
//   that failed outright is not retried by the bus; Evolve puts out such a
//   Raid before it lights its learning's next fire (QS.7c).
import { subscribe, type EventPayload } from "@/kernel/events";
import { mustRows } from "@/kernel/data/read";
import { putOutRaid } from "./put-out";
import { selectQuests } from "./reads";
import { sendCalled, sendDueSoon } from "./quest-messages";

const TAG = "[quests/subscriptions]";

type RaidRow = { id: string; state: string };

/** Puts out the Raid whose session was cancelled, and hands its topic back to Wanted. A failed read or write raises, for the bus to record. */
export async function onSessionCancelled(e: EventPayload<"training.session.cancelled">, now: Date = new Date()): Promise<void> {
  const raids = mustRows(
    await selectQuests("id, state").eq("kind", "raid").eq("training_id", e.trainingId).eq("host_id", e.organiserId).in("state", ["open", "withdrawn"]),
    `${TAG} raid of session ${e.trainingId}`,
  ) as unknown as RaidRow[];
  for (const raid of raids) await putOutRaid({ ...raid, trainingId: e.trainingId }, now);
}

export function subscriptions(): void {
  subscribe("quests", "training.session.cancelled", (e) => onSessionCancelled(e));
  // QS.2: Quests' own email and Lark DMs, run on its own facts so a failed send
  // is the bus's to record and never fails the summon or the clock's run
  // (quest-messages.ts says why they are not the inbox's).
  subscribe("quests", "quest.called", sendCalled);
  subscribe("quests", "quest.head.due_soon", sendDueSoon);
}
