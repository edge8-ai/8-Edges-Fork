// What the composition root registers when coaching is installed.
//
// One file per entity, not one per event: the registration list is the place
// somebody reads to find out what coaching reacts to, and splitting it across
// the handlers' own modules is how an entity ends up with a subscriber nobody
// remembers registering. The handlers themselves live beside the data they
// write.
//
// Nothing here registers itself on import — the composition root calls this for
// the entities a deployment includes, because an entity that subscribed at
// module scope would make registration depend on load order (docs/adr/0003).
import { subscribe } from "@/kernel/events";
import { suggestCommitmentKept } from "./board-subscriptions";
import { moveOneOnOnesOffLeave } from "./leave-subscriptions";

export function subscriptions(): void {
  // A commitment-linked card reached a done column: leave a dated suggestion
  // for the person who made the promise, and nothing else.
  subscribe("coaching", "board.card.completed", suggestCommitmentKept);
  // A holiday was approved over a booked 1-1: move it to the next clear day.
  subscribe("coaching", "leave.approved", moveOneOnOnesOffLeave);
}
