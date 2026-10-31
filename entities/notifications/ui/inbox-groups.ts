// How "What lands here" lays out the kinds (TH.2, as the TH.8 canvas drew it
// for TH.8.3): four groups a person reads in a breath, the asks from teammates
// first. A row may stand for several kinds that a person thinks of as one
// thing ("Someone else finishes, sets aside or ticks a subtask on your card"),
// and its switch turns all of them on or off together. Every kind sits in
// exactly one row; kinds.test.ts holds that.
import type { NotificationKind } from "@/entities/notifications/lib/kinds";

export type PrefRow = { label: string; kinds: readonly NotificationKind[] };

export const NOTIFICATION_GROUPS: readonly { name: string; rows: readonly PrefRow[] }[] = [
  {
    name: "Asks from teammates",
    rows: [
      { label: "Someone assigns you a card", kinds: ["card.assigned"] },
      { label: "Someone @mentions you", kinds: ["card.mentioned"] },
      { label: "Something waits for your approval: time off, a claim, an agreement", kinds: ["approval.waiting"] },
      { label: "Someone replies to your comment", kinds: ["card.replied"] },
      { label: "A blocker is handed to you", kinds: ["blocker.handed"] },
      { label: "Someone comments on a card you own", kinds: ["card.commented"] },
    ],
  },
  {
    name: "Your cards",
    rows: [
      { label: "A card of yours is due tomorrow, or past its date", kinds: ["card.due_tomorrow"] },
      { label: "Someone else finishes, sets aside or ticks a subtask on your card", kinds: ["card.completed", "card.set_aside", "subtask.done"] },
    ],
  },
  {
    name: "Coaching, reviews, training and quests",
    rows: [
      { label: "Your 1-1 is booked, moved or its prep is ready", kinds: ["coaching.one_on_one"] },
      { label: "A review needs your part", kinds: ["review.needs_you"] },
      {
        label: "Training sessions, homework, notes and recaps",
        kinds: [
          "training.prep_ready",
          "training.session_today",
          "training.homework_due",
          "training.note_updated",
          "training.recap_ready",
          "training.recap_published",
          "training.weekly_recap_waiting",
          "training.weekly_recap_held",
        ],
      },
      // QS.2. Muting these keeps them out of the Inbox only: a summon and the
      // two-hour reminder still arrive by email and Lark.
      { label: "A Giver calls you on a Bounty, or reacts to your Turn-in", kinds: ["quest.called", "quest.reacted"] },
    ],
  },
  {
    name: "Sparks, kudos, leave, claims, hiring, revenue",
    rows: [
      { label: "Kudos, sparks built on or picked up", kinds: ["kudos.received", "idea.built", "idea.picked_up", "idea.shipped", "idea.set_aside"] },
      { label: "Your leave and claims are decided or paid", kinds: ["leave.approved", "leave.withdrawn", "claim.decided", "claim.paid"] },
      { label: "Hires, deals won, invoices paid", kinds: ["hire.made", "deal.won", "invoice.paid"] },
    ],
  },
];
