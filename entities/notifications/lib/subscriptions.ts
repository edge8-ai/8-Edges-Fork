// What the composition root registers when this entity is installed (S.3):
// one subscriber per catalogue event, each writing at most one inbox row.
// app/events.ts calls this; nothing else does.
import { subscribe } from "@/kernel/events";
import {
  onApprovalClosed,
  onApprovalRequested,
  onBlockerHanded,
  onCandidateHired,
  onCommentReplied,
  onOneOnOneChanged,
  onReviewPartRequested,
  onReviewPartSubmitted,
  onCardAssigned,
  onCardCommented,
  onCardDueTomorrow,
  onCardMentioned,
  onIdeaSetAside,
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
  onTrainingPrepDrafted,
  onTrainingSessionToday,
  onTrainingHomeworkSet,
  onTrainingNoteUpdated,
  onTrainingRecapDrafted,
  onTrainingRecapPublished,
  onTrainingWeeklyRecapWaiting,
  onTrainingWeeklyRecapHeld,
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
  subscribe("notifications", "board.card.assigned", onCardAssigned);
  subscribe("notifications", "board.card.mentioned", onCardMentioned);
  subscribe("notifications", "board.card.commented", onCardCommented);
  subscribe("notifications", "board.card.due_tomorrow", onCardDueTomorrow);
  subscribe("notifications", "idea.set_aside", onIdeaSetAside);
  subscribe("notifications", "training.prep.drafted", onTrainingPrepDrafted);
  subscribe("notifications", "training.session.today", onTrainingSessionToday);
  subscribe("notifications", "training.homework.set", onTrainingHomeworkSet);
  subscribe("notifications", "training.note.updated", onTrainingNoteUpdated);
  subscribe("notifications", "training.recap.drafted", onTrainingRecapDrafted);
  subscribe("notifications", "training.recap.published", onTrainingRecapPublished);
  subscribe("notifications", "training.weekly_recap.waiting", onTrainingWeeklyRecapWaiting);
  subscribe("notifications", "training.weekly_recap.held", onTrainingWeeklyRecapHeld);
  subscribe("notifications", "approval.requested", onApprovalRequested);
  subscribe("notifications", "approval.closed", onApprovalClosed);
  subscribe("notifications", "board.comment.replied", onCommentReplied);
  subscribe("notifications", "board.blocker.handed", onBlockerHanded);
  subscribe("notifications", "coaching.one_on_one.changed", onOneOnOneChanged);
  subscribe("notifications", "review.part.requested", onReviewPartRequested);
  subscribe("notifications", "review.part.submitted", onReviewPartSubmitted);
}
