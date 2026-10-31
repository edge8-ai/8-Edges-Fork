// What the inbox says for the asks that used to reach a person only by email,
// Lark or another page (TH.8.3): an approval waiting on them, a reply to their
// comment, a blocker tagged to them, their 1-1 booked, moved or its prep
// ready, and their part of a review. Pure, like kinds.ts: who is told is
// resolved before these run (an approval addressed to a permission reaches
// each holder), and these only decide whether there is anything to say.
//
// A fact the person caused themselves says nothing, as everywhere in the inbox.
import type { EventPayload } from "@/kernel/events";
import { approvalPages } from "@/kernel/approvals/presentation";
import { isApprovalSubject } from "@/kernel/approvals/vocabulary";
import { formatDate } from "@/kernel/ui/format";
import { boardLinks, excerpt, owner, quoted, subjectOf, type Draft } from "./kinds";

/**
 * The approvals the inbox asks about (the canvas's "time off, a claim, an
 * agreement"). The agents' drafts and the hiring chain are left out on
 * purpose: nobody asked by name, an agent did, and the Approvals page is where
 * they wait.
 */
export const APPROVAL_ASKS = [
  "time_off",
  "reimbursement_check",
  "reimbursement_approval",
  "agreement_edge8_signature",
  "agreement_client_signature",
] as const;

type ApprovalAsk = (typeof APPROVAL_ASKS)[number];

function isApprovalAsk(subject: string): subject is ApprovalAsk {
  return (APPROVAL_ASKS as readonly string[]).includes(subject);
}

const APPROVAL_TITLE: Record<ApprovalAsk, (label: string) => string> = {
  time_off: (label) => `Time off to approve: ${label}`,
  // The claim's own label already says what to do ("Check claim: …").
  reimbursement_check: (label) => label,
  reimbursement_approval: (label) => label,
  agreement_edge8_signature: (label) => `Sign for Edge8: ${label}`,
  agreement_client_signature: (label) => `Ready for your signature: ${label}`,
};

const APPROVAL_FALLBACK: Record<ApprovalAsk, string> = {
  time_off: "A time-off request waits for your approval",
  reimbursement_check: "A claim waits for your check",
  reimbursement_approval: "A claim waits for your approval",
  agreement_edge8_signature: "An agreement waits for Edge8's signature",
  agreement_client_signature: "An agreement waits for your signature",
};

/**
 * One approver's ask. The row leads where the approval is decided on each
 * surface; a subject with no team page leads to Approvals, which lists
 * everything waiting on the person. Keyed on the approval row, so a refresh of
 * the same request lands once and a request opened again later is news.
 *
 * The inbox is read on Admin and Team only, so a portal page (where a client
 * signs) is never one of its links: a client signer asked to sign is told by
 * email and the portal, and gets no inbox row they could never read.
 */
export function approvalDraft(e: EventPayload<"approval.requested">, personId: string): Draft | null {
  if (!isApprovalAsk(e.subjectType) || !isApprovalSubject(e.subjectType)) return null;
  if (personId === e.requestedBy) return null;
  const pages = approvalPages({ subjectType: e.subjectType, subjectId: e.subjectId, metadata: e.metadata });
  const label = e.label.trim();
  return {
    personId,
    kind: "approval.waiting",
    title: label ? APPROVAL_TITLE[e.subjectType](label) : APPROVAL_FALLBACK[e.subjectType],
    body: null,
    adminHref: pages.admin.find((href) => href.startsWith("/admin/")) ?? null,
    teamHref: pages.team[0] ?? "/team/approvals",
    eventKey: e.approvalId,
  };
}

/** A reply to the person's comment, in the replier's words, linking the card. Keyed on the reply. */
export function repliedDraft(e: EventPayload<"board.comment.replied">): Draft | null {
  const personId = owner(e.assigneeId, e.actorPersonId);
  if (!personId) return null;
  const who = e.actorName ?? "Someone";
  return {
    personId,
    kind: "card.replied",
    title: e.title ? `${who} replied to your comment on ${quoted(e.title)}` : `${who} replied to your comment`,
    body: excerpt(e.body),
    ...boardLinks(e.boardSlug, e.taskId),
    eventKey: e.commentId,
    subject: subjectOf("card", e.taskId),
  };
}

/**
 * A blocker tagged to the person: its words, linking the card it blocks. Keyed
 * on the blocker and the person, so a tag moved away and back is news again
 * while a retried delivery lands once.
 */
export function blockerDraft(e: EventPayload<"board.blocker.handed">): Draft | null {
  const personId = owner(e.assigneeId, e.actorPersonId);
  if (!personId) return null;
  const who = e.actorName ?? "Someone";
  return {
    personId,
    kind: "blocker.handed",
    title: e.title ? `${who} handed you a blocker on ${quoted(e.title)}` : `${who} handed you a blocker`,
    body: excerpt(e.body),
    ...boardLinks(e.boardSlug, e.taskId),
    eventKey: `${e.blockerId}:${personId}`,
    subject: subjectOf("card", e.taskId),
  };
}

function oneOnOneTitle(e: EventPayload<"coaching.one_on_one.changed">, other: string): string {
  const day = formatDate(e.heldOn);
  if (e.change === "booked") return `Your 1-1 with ${other} is booked for ${day}`;
  if (e.change === "moved") return `Your 1-1 with ${other} moved to ${day}`;
  return `The prep for your 1-1 with ${other} on ${day} is ready`;
}

function oneOnOneBody(e: EventPayload<"coaching.one_on_one.changed">, side: "coach" | "coachee"): string | null {
  if (e.change === "moved") return e.movedFrom ? `It was on ${formatDate(e.movedFrom)}.` : null;
  if (e.change === "prep_ready") return side === "coachee" ? "Read it and add what you want to talk about." : "Read it before you meet.";
  return null;
}

// Each side of a 1-1 reads it on their own page: the coachee on My coaching,
// the coach on that person's coaching page.
function oneOnOneHref(e: EventPayload<"coaching.one_on_one.changed">, side: "coach" | "coachee"): string {
  return side === "coachee" ? "/team/my-coaching" : `/team/coaching/${e.profileId}`;
}

/**
 * One row per side coaching asked to tell, leaving out whoever acted. Keyed on
 * the meeting and the change (a move on its new day), so a second move of the
 * same 1-1 is news while a retried delivery is not.
 */
export function oneOnOneDrafts(e: EventPayload<"coaching.one_on_one.changed">): Draft[] {
  const key = e.change === "moved" ? `${e.meetingId}:moved:${e.heldOn}` : `${e.meetingId}:${e.change}`;
  const drafts: Draft[] = [];
  for (const side of new Set(e.tell)) {
    const personId = side === "coach" ? e.coachPersonId : e.coacheePersonId;
    if (!personId || personId === e.actorPersonId) continue;
    const other = side === "coach" ? (e.coacheeName ?? "your teammate") : (e.coachName ?? "your coach");
    drafts.push({
      personId,
      kind: "coaching.one_on_one",
      title: oneOnOneTitle(e, other),
      body: oneOnOneBody(e, side),
      adminHref: null,
      teamHref: oneOnOneHref(e, side),
      eventKey: key,
    });
  }
  return drafts;
}

/**
 * A review part waiting on its rater, linking the form they fill in (the team
 * entity names it). Keyed on the review row, so the weekly reminder of a part
 * already asked adds nothing.
 */
export function reviewDraft(e: EventPayload<"review.part.requested">): Draft {
  const about = e.subjectName ?? "a teammate";
  const title =
    e.raterKind === "self"
      ? `Your self-assessment for your ${e.reviewName} is open`
      : e.raterKind === "manager"
        ? `${e.reviewName} to complete for ${about}`
        : `Your feedback for ${about}'s ${e.reviewName}`;
  return {
    personId: e.raterPersonId,
    kind: "review.needs_you",
    title,
    body: null,
    adminHref: null,
    teamHref: e.formPath,
    eventKey: e.reviewId,
  };
}
