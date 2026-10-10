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
  "kudos.received": "A teammate sends you kudos",
} as const;

export type NotificationKind = keyof typeof NOTIFICATION_KINDS;

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
};

const quoted = (title: string) => `“${title}”`;

// The person to tell about a fact on a card, or nobody: the card's owner, unless
// they are the one who acted, or the publisher could not say who owns it.
function owner(assigneeId: string | null | undefined, actorPersonId: string | null | undefined): string | null {
  if (!assigneeId || assigneeId === actorPersonId) return null;
  return assigneeId;
}

function boardLinks(boardSlug: string, taskId: string) {
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
  };
}
