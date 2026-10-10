// What the composition root registers when this entity is installed (S.3):
// one subscriber per catalogue event, each writing at most one inbox row.
// app/events.ts calls this; nothing else does.
import { subscribe } from "@/kernel/events";
import {
  onCandidateHired,
  onCardCompleted,
  onClaimDecided,
  onClaimPaid,
  onCardLanded,
  onDealWon,
  onIdeaBuilt,
  onIdeaPickedUp,
  onIdeaShipped,
  onKudosGiven,
  onInvoicePaid,
  onLeaveApproved,
  onLeaveWithdrawn,
  onSubtaskToggled,
} from "./deliver";

export function subscriptions(): void {
  subscribe("notifications", "board.card.completed", onCardCompleted);
  subscribe("notifications", "board.card.landed", onCardLanded);
  subscribe("notifications", "board.subtask.toggled", onSubtaskToggled);
  subscribe("notifications", "leave.approved", onLeaveApproved);
  subscribe("notifications", "leave.withdrawn", onLeaveWithdrawn);
  subscribe("notifications", "candidate.hired", onCandidateHired);
  subscribe("notifications", "deal.won", onDealWon);
  subscribe("notifications", "invoice.paid", onInvoicePaid);
  subscribe("notifications", "claim.decided", onClaimDecided);
  subscribe("notifications", "claim.paid", onClaimPaid);
  subscribe("notifications", "idea.built", onIdeaBuilt);
  subscribe("notifications", "idea.picked_up", onIdeaPickedUp);
  subscribe("notifications", "idea.shipped", onIdeaShipped);
  subscribe("notifications", "kudos.given", onKudosGiven);
}
