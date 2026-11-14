// What the composition root registers when this entity is installed (W.192):
// a card picked up from a spark landing in Done is the spark shipping. The
// boards event carries the spark's id; this reads who wrote the spark and
// states idea.shipped addressed to them, so the inbox can tell the author.
// app/events.ts calls this; nothing else does.
import { publish, subscribe, type EventPayload } from "@/kernel/events";
import { mustRows } from "@/kernel/data/read";
import { selectIdeas } from "./reads";

export async function onCardCompleted(e: EventPayload<"board.card.completed">): Promise<void> {
  if (!e.ideaId) return;
  // A failed read must not pass as "no author": the bus logs and audits the
  // throw, which is the right place for it to show.
  const [idea] = mustRows(await selectIdeas("id, person_id, title").eq("id", e.ideaId).limit(1), "[ideas] spark behind a done card") as {
    id: string;
    person_id: string | null;
    title: string;
  }[];
  if (!idea) return;
  await publish("idea.shipped", {
    ideaId: idea.id,
    taskId: e.taskId,
    boardSlug: e.boardSlug,
    title: idea.title,
    assigneeId: idea.person_id,
    actorPersonId: e.actorPersonId ?? null,
  });
}

// A card picked up from a spark was set aside (TH.2): the spark is open again,
// and its author hears so. Any other landing of the card is nobody's news here.
export async function onCardLanded(e: EventPayload<"board.card.landed">): Promise<void> {
  if (e.status !== "not_doing" || !e.ideaId) return;
  const [idea] = mustRows(await selectIdeas("id, person_id, title").eq("id", e.ideaId).limit(1), "[ideas] spark behind a set-aside card") as {
    id: string;
    person_id: string | null;
    title: string;
  }[];
  if (!idea) return;
  await publish("idea.set_aside", {
    ideaId: idea.id,
    taskId: e.taskId,
    boardSlug: e.boardSlug,
    title: idea.title,
    assigneeId: idea.person_id,
    actorPersonId: e.actorPersonId ?? null,
  });
}

export function subscriptions(): void {
  subscribe("ideas", "board.card.completed", onCardCompleted);
  subscribe("ideas", "board.card.landed", onCardLanded);
}
