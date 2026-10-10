// What the composition root registers when campaigns is installed.
//
// Nothing here registers itself on import — the composition root calls this
// for the entities a deployment includes, because an entity that subscribed at
// module scope would make registration depend on load order (docs/adr/0003).
import { subscribe } from "@/kernel/events";
import { onCardLanded, onSubtaskToggled } from "./revenue-board/writeback";

export function subscriptions(): void {
  // A person's move on the Revenue board changes the content calendar: a
  // ticked post is out, a day or a campaign closed is out or dropped.
  subscribe("campaigns", "board.subtask.toggled", onSubtaskToggled);
  subscribe("campaigns", "board.card.landed", onCardLanded);
}
