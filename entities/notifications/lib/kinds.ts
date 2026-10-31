// What each fact says in somebody's inbox, and to whom (S.3). Pure: the
// recipient is resolved before these run, and they only decide whether there is
// anything to say and how to say it.
//
// The inbox tells a person what changed on their work since they last looked.
// So a fact the person caused themselves says nothing: every publisher but the
// payment states who acted, and a draft for that person is dropped. A hire, a
// win and an approval were once assumed to be somebody else's decision; they
// are not always (an auto-approved request, the org lead's own leave, an owner's
// own win), so they carry the actor too (S.19.9). A fact with nobody to tell
// writes no row. Each
// draft carries a link for both surfaces, because the inbox is read on both and
// may not reach back into the entity that owns the thing to build one later.
import type { EventPayload } from "@/kernel/events";
import { formatCents, formatDate, formatVndWhole } from "@/kernel/ui/format";

/** The kinds, in the order the preferences list them, with the line each shows there. */
export const NOTIFICATION_KINDS = {
  "card.assigned": "Someone assigns you a card",
  "card.mentioned": "Someone @mentions you on a card",
  "approval.waiting": "Something waits for your approval: time off, a claim, an agreement",
  "card.replied": "Someone replies to your comment",
  "blocker.handed": "A blocker is handed to you",
  "card.commented": "Someone comments on a card you own",
  "card.due_tomorrow": "A card of yours is due tomorrow",
  "card.completed": "Someone else finishes a card assigned to you",
  "card.set_aside": "Someone else sets aside a card assigned to you",
  "subtask.done": "Someone else ticks a subtask on your card",
  "leave.approved": "Your leave is approved",
  "leave.withdrawn": "Someone else cancels or denies your approved leave",
  "hire.made": "Someone is hired on your requisition",
  "deal.won": "A deal you own is won",
  "invoice.paid": "An invoice of a company you own is paid",
  "claim.decided": "Your reimbursement claim is sent back, rejected, approved, or returned after a failed transfer",
  "claim.paid": "Your reimbursement claim is paid",
  "idea.built": "A teammate builds on a spark of yours",
  "idea.picked_up": "A teammate picks up a spark of yours as a card",
  "idea.shipped": "A card picked up from a spark of yours is done",
  "idea.set_aside": "A card picked up from a spark of yours is set aside",
  "kudos.received": "A teammate sends you kudos",
  "coaching.one_on_one": "Your 1-1 is booked, moved or its prep is ready",
  "review.needs_you": "A review needs your part",
  "training.prep_ready": "A session plan of yours is drafted and ready to check",
  "training.session_today": "A training you run is today",
  "training.homework_due": "Homework is set for a session you are on",
  "training.note_updated": "Your teacher updated their note about you",
  "training.recap_ready": "A session recap of yours is drafted and waiting for approval",
  "training.recap_published": "The recap of a session you were in is published",
  "training.weekly_recap_waiting": "A weekly recap of a plan you run is drafted and waits for you",
  "training.weekly_recap_held": "A weekly recap you receive was held, with the reason",
  "quest.called": "A Giver calls you on a Bounty",
  "quest.reacted": "The Giver reacts to your Turn-in",
} as const;

export type NotificationKind = keyof typeof NOTIFICATION_KINDS;

// The kinds that ask something of the person (TH.2): they make the Inbox's
// "Needs you" list and stay there until the person marks them done.
export const NEEDS_YOU_KINDS: readonly NotificationKind[] = [
  "card.assigned",
  "card.mentioned",
  "approval.waiting",
  "card.replied",
  "blocker.handed",
  "card.commented",
  "coaching.one_on_one",
  "review.needs_you",
  "card.due_tomorrow",
];

// TH.8: "Needs you" holds two different things, and the team Inbox keeps them
// apart. An ASK is a teammate asking this person for something; it leads the
// page and is the only thing the count on the sidebar's Inbox row counts, so
// the count means "someone is waiting on you". A REMINDER is a routine
// noticing a date; it waits quietly in its own list and never counts, because
// a count fed by a routine is the one people learn to ignore (the W3C badging
// draft's "notification fatigue"). Every Needs-you kind is exactly one of the
// two (kinds.test.ts).
//
// TH.8.3 brought in the asks that used to reach a person only by email, Lark
// or another page: an approval waiting on them, a reply to their comment, a
// blocker tagged to them, their 1-1 booked, moved or its prep ready, and their
// part of a review.
//
// TH.11: an approval waiting on the person is a DECISION, not an ask. The team
// Inbox lists every decision in its own section from the approvals reader
// (named, role-addressed and the admins' pool), and the sidebar's count adds
// them from the same reader, so the approval.waiting row is neither listed nor
// counted again. It is still written: the admin Inbox shows it, and it settles
// when the approval closes.
export const ASK_KINDS: readonly NotificationKind[] = [
  "card.assigned",
  "card.mentioned",
  "card.replied",
  "blocker.handed",
  "card.commented",
  "coaching.one_on_one",
  "review.needs_you",
];
export const REMINDER_KINDS: readonly NotificationKind[] = ["card.due_tomorrow"];
export const DECISION_KINDS: readonly NotificationKind[] = ["approval.waiting"];

// Direct requests (TH.2): always on. Neither a kind preference nor a muted card
// keeps them out, as in Linear and Figma: someone asked this person by name.
// An approval, a reply and a blocker are asked of them by name too (TH.8.3).
export const ALWAYS_ON_KINDS: readonly NotificationKind[] = ["card.assigned", "card.mentioned", "approval.waiting", "card.replied", "blocker.handed"];

export function isNotificationKind(value: string): value is NotificationKind {
  return value in NOTIFICATION_KINDS;
}

/** One row to write: who it is for, what it says, where it leads, and what it dedupes on. */
export type Draft = {
  personId: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  adminHref: string | null;
  teamHref: string | null;
  eventKey: string;
  // The card or spark the row is about (TH.2), as card:<id> or idea:<id>, so the
  // inbox can show several rows about one card as one line and a person can
  // stop updates about it. Absent for rows about anything else.
  subject?: string | null;
};

export const quoted = (title: string) => `“${title}”`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** card:<id> or idea:<id>, or null when the id is not a uuid the column's check accepts. */
export function subjectOf(type: "card" | "idea", id: string | null | undefined): string | null {
  const lower = id?.toLowerCase();
  return lower && UUID.test(lower) ? `${type}:${lower}` : null;
}

/** A comment or note cut to the length an inbox line shows. */
export function excerpt(text: string): string {
  return text.length > 160 ? `${text.slice(0, 159).trimEnd()}…` : text;
}

// The person to tell about a fact on a card, or nobody: the card's owner, unless
// they are the one who acted, or the publisher could not say who owns it.
export function owner(assigneeId: string | null | undefined, actorPersonId: string | null | undefined): string | null {
  if (!assigneeId || assigneeId === actorPersonId) return null;
  return assigneeId;
}

export function boardLinks(boardSlug: string, taskId: string) {
  const path = `/boards/${boardSlug}?card=${taskId}`;
  return { adminHref: `/admin${path}`, teamHref: `/team${path}` };
}

export function cardDraft(
  kind: "card.completed" | "card.set_aside",
  e: EventPayload<"board.card.completed">,
): Draft | null {
  const personId = owner(e.assigneeId, e.actorPersonId);
  if (!personId) return null;
  const verb = kind === "card.completed" ? "finished" : "set aside";
  return {
    personId,
    kind,
    title: e.title ? `${quoted(e.title)} was ${verb}` : `A card of yours was ${verb}`,
    body: null,
    ...boardLinks(e.boardSlug, e.taskId),
    eventKey: e.taskId,
    subject: subjectOf("card", e.taskId),
  };
}

export function subtaskDraft(e: EventPayload<"board.subtask.toggled">): Draft | null {
  if (!e.done) return null;
  const personId = owner(e.assigneeId, e.actorPersonId);
  if (!personId) return null;
  const on = e.parentTitle ? ` on ${quoted(e.parentTitle)}` : "";
  const links = e.boardSlug && e.parentTaskId ? boardLinks(e.boardSlug, e.parentTaskId) : { adminHref: null, teamHref: null };
  return {
    personId,
    kind: "subtask.done",
    title: e.title ? `${quoted(e.title)} was ticked${on}` : `A subtask was ticked${on}`,
    body: null,
    ...links,
    eventKey: e.subtaskId,
    subject: subjectOf("card", e.parentTaskId),
  };
}

export function leaveDraft(e: EventPayload<"leave.approved">, requester: string | null): Draft | null {
  if (!requester || requester === e.actorPersonId) return null;
  return {
    personId: requester,
    kind: "leave.approved",
    title: `Your ${e.leaveType} leave was approved`,
    body: e.startDate === e.endDate ? e.startDate : `${e.startDate} to ${e.endDate}`,
    adminHref: "/admin/operations/time-off/requests",
    teamHref: "/team/time-off",
    eventKey: e.requestId,
  };
}

// Withdrawn leave (A.30): approved leave somebody else cancelled or denied.
// Keyed on the request like the approval, in its own kind, so the approval's
// row does not swallow it as a duplicate and a repeat of this fact lands once.
export function leaveWithdrawnDraft(e: EventPayload<"leave.withdrawn">, requester: string | null): Draft | null {
  if (!requester || requester === e.actorPersonId) return null;
  return {
    personId: requester,
    kind: "leave.withdrawn",
    title: `Your approved ${e.leaveType} leave was ${e.became === "rejected" ? "denied" : "cancelled"}`,
    body: e.startDate === e.endDate ? e.startDate : `${e.startDate} to ${e.endDate}`,
    adminHref: "/admin/operations/time-off/requests",
    teamHref: "/team/time-off",
    eventKey: e.requestId,
  };
}

export function hireDraft(e: EventPayload<"candidate.hired">): Draft | null {
  if (!e.hiringManagerId || e.hiringManagerId === e.actorPersonId) return null;
  return {
    personId: e.hiringManagerId,
    kind: "hire.made",
    title: "Someone was hired on your requisition",
    body: null,
    adminHref: `/admin/talent/applications/${e.applicationId}`,
    teamHref: "/team/hiring",
    eventKey: e.applicationId,
  };
}

/** The deal's owner, or the company's owner when the deal names none. */
export function dealDraft(e: EventPayload<"deal.won">, companyOwner: string | null): Draft | null {
  const personId = e.ownerId ?? companyOwner;
  if (!personId || personId === e.actorPersonId) return null;
  return {
    personId,
    kind: "deal.won",
    title: e.title ? `${quoted(e.title)} was won` : "A deal of yours was won",
    body: e.amountUsdCents === null ? null : formatCents(e.amountUsdCents, "usd"),
    adminHref: `/admin/revenue/deals/${e.dealId}`,
    teamHref: `/team/revenue/deals/${e.dealId}`,
    eventKey: e.dealId,
  };
}

export function invoiceDraft(e: EventPayload<"invoice.paid">, companyOwner: string | null): Draft | null {
  if (!companyOwner) return null;
  const q = e.docNumber ? `?q=${encodeURIComponent(e.docNumber)}` : "";
  return {
    personId: companyOwner,
    kind: "invoice.paid",
    title: e.docNumber ? `Invoice ${e.docNumber} was paid` : "An invoice was paid",
    body: formatCents(e.amountCents, e.currency),
    adminHref: `/admin/revenue/invoices${q}`,
    teamHref: `/team/revenue/invoices${q}`,
    eventKey: e.invoiceId,
  };
}

// A reimbursement claim's owner reads it on the Team view (/team/claims), so
// the row links there and nowhere in Admin. Keyed on the claim's history row,
// so the same decision announced twice lands once while a second send back
// after a resubmission is news again.
const claimLinks = (claimId: string) => ({ adminHref: null, teamHref: `/team/claims/${claimId}` });

const DECIDED_TITLE: Record<Exclude<EventPayload<"claim.decided">["became"], "checked">, string> = {
  sent_back: "was sent back to you",
  rejected: "was rejected",
  approved: "was approved",
  returned: "was returned: the transfer did not go through",
};

/** What the owner reads under the title: the total and its run, the reason, or for a return both the reason and what to do. */
function decidedBody(e: EventPayload<"claim.decided">): string | null {
  const run = e.runDate ? `paid in the run on ${formatDate(e.runDate)}` : null;
  if (e.became === "approved") return `${formatVndWhole(e.approvedTotalVnd)}${run ? `, ${run}` : ""}`;
  if (e.became === "returned") return `${(e.reason ?? "The bank refused the transfer").replace(/[.!?\s]+$/, "")}. Check your bank details on the claim; it is ${run ?? "paid in the next run"}.`;
  return e.reason;
}

/**
 * A claim decided by someone else (design §1.8): the owner reads a send back
 * or a rejection with its reason, an approval with the run that will pay it,
 * and a payment returned after a failed transfer with its reason and the run
 * that pays it instead. A check is the approver's news, so it writes no row
 * for the owner.
 */
export function claimDecidedDraft(e: EventPayload<"claim.decided">): Draft | null {
  if (e.became === "checked" || e.ownerPersonId === e.actorPersonId) return null;
  const title = `${quoted(e.title)} ${DECIDED_TITLE[e.became]}`;
  const body = decidedBody(e);
  return { personId: e.ownerPersonId, kind: "claim.decided", title, body, ...claimLinks(e.claimId), eventKey: `${e.claimId}:${e.eventId ?? e.became}` };
}

/** A claim paid: the owner is told, and the claim it links to is where the bank's receipt downloads. */
export function claimPaidDraft(e: EventPayload<"claim.paid">): Draft | null {
  if (e.ownerPersonId === e.actorPersonId) return null;
  return {
    personId: e.ownerPersonId,
    kind: "claim.paid",
    title: `${quoted(e.title)} was paid`,
    body: "The bank's receipt is on the claim.",
    ...claimLinks(e.claimId),
    eventKey: `${e.claimId}:${e.eventId ?? e.paymentId}`,
  };
}

// A build on a spark (ID.2.7): the spark's author hears who built on it and
// the words, unless they built on their own spark. Keyed on the build, so each
// build lands once and two builds by one teammate are two lines.
export function ideaBuiltDraft(e: EventPayload<"idea.built">): Draft | null {
  const personId = owner(e.assigneeId, e.actorPersonId);
  if (!personId) return null;
  const who = e.actorName ?? "A teammate";
  const body = e.body.length > 160 ? `${e.body.slice(0, 159).trimEnd()}…` : e.body;
  return {
    personId,
    kind: "idea.built",
    title: e.title ? `${who} built on ${quoted(e.title)}` : `${who} built on a spark of yours`,
    body,
    adminHref: null,
    teamHref: `/team/ideas/${e.ideaId}`,
    eventKey: e.buildId,
    subject: subjectOf("idea", e.ideaId),
  };
}

// Kudos (TH.1.8): a teammate thanked you on the Kudos board. The note carries
// their words, linking the month's board where it sits. Keyed on the kudos row,
// so a retried delivery never thanks you twice.
export function kudosDraft(e: EventPayload<"kudos.given">): Draft | null {
  const personId = owner(e.assigneeId, e.actorPersonId);
  if (!personId) return null;
  const who = e.actorName ?? "A teammate";
  const body = e.body.length > 160 ? `${e.body.slice(0, 159).trimEnd()}…` : e.body;
  return {
    personId,
    kind: "kudos.received",
    title: `${who} sent you kudos`,
    body,
    adminHref: null,
    teamHref: "/team/kudos",
    eventKey: e.kudosId,
  };
}

// Shipped (W.192): the card picked up from the spark reached Done. The author
// hears it, linking the spark, which now reads Shipped. Keyed on the card.
export function ideaShippedDraft(e: EventPayload<"idea.shipped">): Draft | null {
  const personId = owner(e.assigneeId, e.actorPersonId);
  if (!personId) return null;
  // The sentence is about the spark, not who closed the card: the boards event
  // that starts this names no actor, and "A teammate shipped" said less.
  return {
    personId,
    kind: "idea.shipped",
    title: e.title ? `Your spark ${quoted(e.title)} shipped` : "A spark of yours shipped",
    body: "The card picked up from it is done. Your name is on the spark that started it.",
    adminHref: null,
    teamHref: `/team/ideas/${e.ideaId}`,
    eventKey: e.taskId,
    subject: subjectOf("idea", e.ideaId),
  };
}

// A pick-up (ID.2.8): the spark's author hears who took it on, linking the
// spark, which links on to the card. Keyed on the card, so it lands once.
export function ideaPickedUpDraft(e: EventPayload<"idea.picked_up">): Draft | null {
  const personId = owner(e.assigneeId, e.actorPersonId);
  if (!personId) return null;
  const who = e.actorName ?? "A teammate";
  return {
    personId,
    kind: "idea.picked_up",
    title: e.title ? `${who} picked up ${quoted(e.title)}` : `${who} picked up a spark of yours`,
    body: "It's a Workboard card now. It shows as Shipped once the card is done.",
    adminHref: null,
    teamHref: `/team/ideas/${e.ideaId}`,
    eventKey: e.taskId,
    subject: subjectOf("idea", e.ideaId),
  };
}
