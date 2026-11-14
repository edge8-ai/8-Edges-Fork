// The facts behind the inbox's asks (TH.8.3), part of the one vocabulary in
// catalogue.ts and split out only for the file-size cap: an approval waiting,
// a reply, a blocker tagged, a 1-1 changed, a review part asked and done.
import { z } from "zod";
import { addressedTo, calendarDate } from "./catalogue-shapes";

export const ASK_EVENTS = {
  // Someone replied to a comment (TH.8.3). The addressee is the author of the
  // comment replied to; the inbox tells them unless they replied to themselves.
  // Boards states it once per reply, beside the mention and comment facts, and
  // leaves the parent's author out of those so one reply is told once.
  "board.comment.replied": z.object({
    taskId: z.string().min(1),
    boardSlug: z.string().min(1),
    commentId: z.string().min(1),
    parentCommentId: z.string().min(1),
    body: z.string().min(1),
    actorName: z.string().min(1).optional(),
    ...addressedTo,
  }),

  // A blocker on a card was tagged to someone, when it was added or when its
  // tag moved (TH.8.3). Here `title` is the card's and `body` the blocker's
  // words; the addressee is the person tagged. A client contact tag reaches the
  // inbox's subscriber too, which writes nothing for a page they cannot open.
  "board.blocker.handed": z.object({
    blockerId: z.string().min(1),
    taskId: z.string().min(1),
    boardSlug: z.string().min(1),
    body: z.string().min(1),
    actorName: z.string().min(1).optional(),
    ...addressedTo,
  }),

  // An approval opened, or a pending one was readdressed (TH.8.3). The approvals
  // primitive states it for every subject, so a deployment can listen to the
  // flows it wants; the inbox listens for time off, claims and agreements. It
  // waits on one person, or on whoever holds a permission, or on nobody named
  // (the admins' pool). `approvalId` is the row, so one request is one fact
  // however often it is refreshed, and a request opened again later is news.
  "approval.requested": z.object({
    approvalId: z.string().min(1),
    subjectType: z.string().min(1),
    subjectId: z.string().min(1),
    label: z.string(),
    requestedBy: z.string().min(1).nullable(),
    approverPersonId: z.string().min(1).nullable(),
    approverPermission: z.string().min(1).nullable(),
    metadata: z.record(z.string(), z.unknown()),
  }),

  // A pending approval was decided, cancelled or withdrawn (TH.8.3). The inbox
  // listens: an ask about it is settled for everyone it went to, so a claim one
  // checker checked stops waiting on the others.
  "approval.closed": z.object({
    approvalId: z.string().min(1),
    subjectType: z.string().min(1),
    subjectId: z.string().min(1),
    state: z.enum(["approved", "rejected", "cancelled"]),
  }),

  // A 1-1 was booked, moved, or its prep is ready to read (TH.8.3). Coaching
  // states who is on each side and whom to `tell`: the other party when one of
  // them acted, both when a routine did. The inbox writes one row per person
  // told. `heldOn` is the day it is booked for; `movedFrom` the day it left.
  "coaching.one_on_one.changed": z.object({
    meetingId: z.string().min(1),
    profileId: z.string().min(1),
    change: z.enum(["booked", "moved", "prep_ready"]),
    heldOn: calendarDate,
    movedFrom: calendarDate.nullable(),
    coachPersonId: z.string().min(1).nullable(),
    coacheePersonId: z.string().min(1).nullable(),
    coachName: z.string().min(1).nullable(),
    coacheeName: z.string().min(1).nullable(),
    tell: z.array(z.enum(["coach", "coachee"])),
    actorPersonId: addressedTo.actorPersonId,
  }),

  // A performance review waits on one rater's part (TH.8.3): a cycle opened,
  // or its weekly reminder came round. The addressee is the rater, as a
  // person; an external rater has none and is not stated. Keyed on the review
  // row, so a reminder of a part already in the inbox adds nothing.
  "review.part.requested": z.object({
    reviewId: z.string().min(1),
    raterPersonId: z.string().min(1),
    raterKind: z.enum(["self", "manager", "reviewer"]),
    reviewName: z.string().min(1),
    subjectName: z.string().min(1).nullable(),
    /** Where the rater fills in their part, a path on this site (`/surveys/…`). */
    formPath: z.string().startsWith("/"),
  }),

  // A rater submitted their part of a review (TH.8.3). The inbox settles the
  // ask it wrote for that part. A client review part also says whom to tell
  // (CR.2.6): the person who opened its cycle hears that the member's
  // self-assessment or the client manager's part was sent, since she sends
  // each next link herself. `sentAt` is this send's time, so a part reopened
  // and sent again is news again. Nobody in this block is a client contact.
  "review.part.submitted": z.object({
    reviewId: z.string().min(1),
    client: z
      .object({
        ownerPersonId: z.string().min(1),
        cycleName: z.string().min(1),
        memberName: z.string().min(1),
        memberPersonId: z.string().min(1).nullable(),
        part: z.enum(["member", "client_manager"]),
        overviewPath: z.string().startsWith("/"),
        sentAt: z.string().min(1),
      })
      .optional(),
  }),

  // Every member still in a client review cycle is marked Reviewed by its
  // skip-manager (CR.3.2). The person who opened the cycle is told once, so
  // they know the client's side is finished. `members` is how many were
  // marked, so a member added afterwards and marked tells again. Nobody in it
  // is told but the opener, who is on the team.
  "review.cycle.all_marked": z.object({
    cycleId: z.string().min(1),
    ownerPersonId: z.string().min(1),
    cycleName: z.string().min(1),
    skipManagerName: z.string().min(1),
    members: z.number().int().positive(),
    overviewPath: z.string().startsWith("/"),
  }),

  // A client review framework's usual opening date is a week or less away
  // (CR.3.5). The person who opened its last cycle is nudged to open the next
  // one; nothing is opened for them, and nobody at the client is told.
  "review.framework.opening_due": z.object({
    frameworkId: z.string().min(1),
    frameworkName: z.string().min(1),
    clientName: z.string().min(1).nullable(),
    ownerPersonId: z.string().min(1),
    opensOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    newCyclePath: z.string().startsWith("/"),
  }),
} as const;
