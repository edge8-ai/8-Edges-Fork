// What the composition root registers when ladders is installed (LD.2; spec
// "How positions are written"; ADR 0021): an act lands, and the one person it
// names climbs at once instead of at the nightly replay. Every handler is a
// recompute of that person from their acts, never an addition, so a fact
// delivered twice, or out of order, writes the same rows; and a source taken
// back (a card out of Done, a register mark undone) lowers the points and
// never the tier they hold. A handler failure is the bus's to log and audit,
// and the replay repairs what it missed. app/events.ts calls subscriptions();
// nothing else does.
//
// What is listened to, and whom it recomputes:
// - board.card.completed: the card's assignee.
// - board.card.landed with a status other than done: the card's assignee, so a
//   card taken out of Done is corrected. A landing in done is the completion,
//   already handled above, so it is not recomputed twice.
// - idea.posted: the spark's author.
// - training.attendance.marked: the Host of the Raid behind the session, asked
//   of the Quests door; a session that is no Raid's recomputes nobody. A mark
//   made while the session is on credits nothing yet: a fire is not held
//   while it burns (ADR 0023), and the next fact covers it.
// - quest.turned_in: the person who turned in, for a hit or a Beacon lit
//   (A.75). Never the Giver: a Turn-in earns its Giver nothing.
// - quest.fire.held: the Host, once the quest clock sees the session ended
//   (ADR 0023). The clock may state a fire twice; the recompute is the same.
//
// Not listened to, and left to the replay:
// a done subtask with no assignee of its own is credited to its parent's
// assignee, whom the card facts do not name; and a done card handed to someone
// else (board.card.assigned) moves its points at the replay.
import { subscribe, type EventPayload } from "@/kernel/events";
import { raidHostsOf } from "@/entities/quests";
import { recomputePerson } from "./recompute";

export type SubscriberDeps = {
  /** Recomputes one person from their acts, as an event (unlocks left unshown). */
  recompute(personId: string): Promise<unknown>;
  /** The Host of the Raid behind each session, from the Quests door. */
  raidHostsOf(trainingIds: readonly string[]): Promise<Map<string, string>>;
};

// Built when a fact arrives, never at module scope: a door value read while an
// entity index is still loading is undefined (scripts/entity-door-load-order.test.mjs).
function liveSubscriberDeps(): SubscriberDeps {
  return { recompute: (personId) => recomputePerson(personId, "event"), raidHostsOf };
}

/** The six handlers over the given dependencies; the tests drive them with the in-memory doors and store. */
export function ladderHandlers(deps: () => SubscriberDeps = liveSubscriberDeps) {
  return {
    async onCardCompleted(e: EventPayload<"board.card.completed">): Promise<void> {
      if (e.assigneeId) await deps().recompute(e.assigneeId);
    },
    async onCardLanded(e: EventPayload<"board.card.landed">): Promise<void> {
      if (e.status === "done" || !e.assigneeId) return;
      await deps().recompute(e.assigneeId);
    },
    async onIdeaPosted(e: EventPayload<"idea.posted">): Promise<void> {
      await deps().recompute(e.personId);
    },
    async onAttendanceMarked(e: EventPayload<"training.attendance.marked">): Promise<void> {
      const d = deps();
      const host = (await d.raidHostsOf([e.trainingId])).get(e.trainingId);
      if (host) await d.recompute(host);
    },
    async onTurnedIn(e: EventPayload<"quest.turned_in">): Promise<void> {
      await deps().recompute(e.personId);
    },
    async onFireHeld(e: EventPayload<"quest.fire.held">): Promise<void> {
      await deps().recompute(e.hostId);
    },
  };
}

export function subscriptions(): void {
  const h = ladderHandlers();
  subscribe("ladders", "board.card.completed", h.onCardCompleted);
  subscribe("ladders", "board.card.landed", h.onCardLanded);
  subscribe("ladders", "idea.posted", h.onIdeaPosted);
  subscribe("ladders", "training.attendance.marked", h.onAttendanceMarked);
  subscribe("ladders", "quest.turned_in", h.onTurnedIn);
  subscribe("ladders", "quest.fire.held", h.onFireHeld);
}
