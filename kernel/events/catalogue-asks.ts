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
  // ask it wrote for that part.
  "review.part.submitted": z.object({
    reviewId: z.string().min(1),
  }),
} as const;
