// What the composition root registers when boards is installed.
//
// Nothing here registers itself on import — the composition root calls this
// for the entities a deployment includes, because an entity that subscribed at
// module scope would make registration depend on load order (docs/adr/0003).
import { subscribe, type EventPayload } from "@/kernel/events";
import { openDeliveryBoardsForWin } from "./deal-subscriptions";
import { landCardsForMergedPullRequests } from "./pr-done";
import { stampSyncedPullRequests } from "./pr-stamp";

export function subscriptions(): void {
  // A deal was won: open the delivery board of every programme the account
  // runs, so the work has somewhere to land before anybody goes looking.
  subscribe("boards", "deal.won", openDeliveryBoardsForWin);
  // HTT synced some pull requests: the cards that link them show each PR's
  // title and state (W.161). Without HTT installed nothing states this.
  // And a merged PR finishes the open card that links it (Z.16). One handler,
  // not two: the bus records deliveries per entity, so a second "boards"
  // handler that never ran would hide behind the first. The stamp goes first,
  // and the landing is tried even when a stamp failed.
  subscribe("boards", "pull_requests.synced", onPullRequestsSynced);
}

async function onPullRequestsSynced(payload: EventPayload<"pull_requests.synced">): Promise<void> {
  const errors: string[] = [];
  for (const step of [stampSyncedPullRequests, landCardsForMergedPullRequests]) {
    try {
      await step(payload);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (errors.length > 0) throw new Error(errors.join(" | "));
}
