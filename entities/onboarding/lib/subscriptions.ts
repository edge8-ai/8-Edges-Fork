// What the composition root registers when onboarding is installed.
//
// Nothing here registers itself on import — the composition root calls this
// for the entities a deployment includes, because an entity that subscribed at
// module scope would make registration depend on load order (docs/adr/0003).
import { subscribe } from "@/kernel/events";
import { openPlanForHire } from "./hire-subscriptions";

export function subscriptions(): void {
  // An application reached hired: open the new starter's journey now rather
  // than on whichever backfill next runs.
  subscribe("onboarding", "candidate.hired", openPlanForHire);
}
