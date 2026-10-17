// How "What lands here" groups the kinds (TH.2): by what they are about, so a
// person finds the line they want without reading all twenty. Every kind sits in
// exactly one group; kinds.test.ts holds that.
import type { NotificationKind } from "@/entities/notifications/lib/kinds";

export const NOTIFICATION_GROUPS: readonly { name: string; kinds: readonly NotificationKind[] }[] = [
  {
    name: "Your cards",
    kinds: ["card.assigned", "card.mentioned", "card.commented", "card.due_tomorrow", "card.completed", "card.set_aside", "subtask.done"],
  },
  { name: "Sparks and kudos", kinds: ["idea.built", "idea.picked_up", "idea.shipped", "idea.set_aside", "kudos.received"] },
  { name: "Leave and claims", kinds: ["leave.approved", "leave.withdrawn", "claim.decided", "claim.paid"] },
  { name: "Hiring and revenue", kinds: ["hire.made", "deal.won", "invoice.paid"] },
  { name: "Training", kinds: ["training.prep_ready", "training.session_today", "training.homework_due", "training.note_updated", "training.recap_ready", "training.recap_published", "training.weekly_recap_waiting", "training.weekly_recap_held"] },
];
