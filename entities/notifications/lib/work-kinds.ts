// What the inbox says when a person's work changes (TH.2): a card handed to
// them, a mention, a comment on their card, a card due tomorrow, and the card
// picked up from their spark set aside. Pure, like kinds.ts: the recipient is in
// the payload, and these only decide whether there is anything to say.
//
// Every row here names its card or spark as its subject, so the inbox can show
// several rows about one card as one line and a person can stop updates about
// it. A fact the person caused themselves says nothing (owner()).
import type { EventPayload } from "@/kernel/events";
import { addDays, saigonToday } from "@/kernel/config/dates";
import { boardLinks, excerpt, owner, quoted, subjectOf, type Draft } from "./kinds";

// An hour of the clock, so a retried delivery of one handover lands once while a
// card handed back to someone later in the week is news again.
function hourKey(at: Date): string {
  return at.toISOString().slice(0, 13);
}

/** A card handed to someone, with the handover note as its second line. */
export function assignedDraft(e: EventPayload<"board.card.assigned">, at: Date = new Date()): Draft | null {
  const personId = owner(e.assigneeId, e.actorPersonId);
  if (!personId) return null;
  const who = e.actorName ?? "Someone";
  return {
    personId,
    kind: "card.assigned",
    title: e.title ? `${who} assigned you ${quoted(e.title)}` : `${who} assigned you a card`,
    body: e.note ? excerpt(e.note) : null,
    ...boardLinks(e.boardSlug, e.taskId),
    eventKey: `${e.taskId}:${hourKey(at)}`,
    subject: subjectOf("card", e.taskId),
  };
}

/** One person tagged in a comment: their words, linking the card. Keyed on the comment. */
export function mentionedDraft(e: EventPayload<"board.card.mentioned">): Draft | null {
  const personId = owner(e.assigneeId, e.actorPersonId);
  if (!personId) return null;
  const who = e.actorName ?? "Someone";
  return {
    personId,
    kind: "card.mentioned",
    title: e.title ? `${who} mentioned you on ${quoted(e.title)}` : `${who} mentioned you on a card`,
    body: excerpt(e.body),
    ...boardLinks(e.boardSlug, e.taskId),
    eventKey: e.commentId,
    subject: subjectOf("card", e.taskId),
  };
}

/**
 * A comment on the card's owner's card, unless they wrote it or were mentioned
 * in it: the mention already told them, and once is enough.
 */
export function commentedDraft(e: EventPayload<"board.card.commented">): Draft | null {
  const personId = owner(e.assigneeId, e.actorPersonId);
  if (!personId || e.mentionedIds?.includes(personId)) return null;
  const who = e.actorName ?? "Someone";
  return {
    personId,
    kind: "card.commented",
    title: e.title ? `${who} commented on ${quoted(e.title)}` : `${who} commented on your card`,
    body: excerpt(e.body),
    ...boardLinks(e.boardSlug, e.taskId),
    eventKey: e.commentId,
    subject: subjectOf("card", e.taskId),
  };
}

function dayName(dueOn: string): string {
  return new Date(`${dueOn}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** "today", "tomorrow", or the day by name when a Friday run reaches past it ("Mon 13 Oct"). */
export function dueWhen(dueOn: string, today: string): string {
  if (dueOn === today) return "today";
  if (dueOn === addDays(today, 1)) return "tomorrow";
  return dayName(dueOn);
}

/**
 * A due row's sentence as of `today`. A date that has passed says when the card
 * was due rather than "overdue": the inbox cannot see whether the card has since
 * been finished or moved, and "was due" is true either way.
 */
export function dueTitle(cardTitle: string | null, dueOn: string, today: string): string {
  if (dueOn < today) return cardTitle ? `Was due ${dayName(dueOn)}: ${quoted(cardTitle)}` : `A card of yours was due ${dayName(dueOn)}`;
  const when = dueWhen(dueOn, today);
  return cardTitle ? `Due ${when}: ${quoted(cardTitle)}` : `A card of yours is due ${when}`;
}

const WRITTEN_DUE = /^Due [^:]+: “([\s\S]*)”$/;
const DUE_KEY = /:(\d{4}-\d{2}-\d{2})$/;

/** The due date a due row announced, read from its key (`<taskId>:<dueOn>`); null for any other key. */
export function dueOnOf(eventKey: string): string | null {
  return DUE_KEY.exec(eventKey)?.[1] ?? null;
}

/**
 * The sentence a due row shows when it is read (OV.6.1). The routine writes
 * "Due tomorrow" the morning before, and the row stays in the inbox for days,
 * so on 18 Oct 2026 twenty-two rows stamped "3d ago" still said "Due tomorrow".
 * The row is keyed on the due date it announced, so the page says it again from
 * that date. A row whose key or words are not the shape dueTomorrowDraft writes
 * keeps the words it was written with.
 */
export function dueTitleAsOf(written: string, eventKey: string, today: string): string {
  const dueOn = dueOnOf(eventKey);
  if (!dueOn) return written;
  const named = WRITTEN_DUE.exec(written);
  if (named) return dueTitle(named[1], dueOn, today);
  if (written.startsWith("A card of yours is due ")) return dueTitle(null, dueOn, today);
  return written;
}

/** An open card due by the next working day, once per card per due date. */
export function dueTomorrowDraft(e: EventPayload<"board.card.due_tomorrow">, today: string = saigonToday()): Draft | null {
  if (!e.assigneeId) return null;
  return {
    personId: e.assigneeId,
    kind: "card.due_tomorrow",
    title: dueTitle(e.title || null, e.dueOn, today),
    body: null,
    ...boardLinks(e.boardSlug, e.taskId),
    eventKey: `${e.taskId}:${e.dueOn}`,
    subject: subjectOf("card", e.taskId),
  };
}

/** The card picked up from a spark set aside: the spark is open again. Keyed on the card. */
export function ideaSetAsideDraft(e: EventPayload<"idea.set_aside">): Draft | null {
  const personId = owner(e.assigneeId, e.actorPersonId);
  if (!personId) return null;
  return {
    personId,
    kind: "idea.set_aside",
    title: e.title ? `The card picked up from ${quoted(e.title)} was set aside` : "The card picked up from a spark of yours was set aside",
    body: "Your spark is open again for anyone to pick up.",
    adminHref: null,
    teamHref: `/team/ideas/${e.ideaId}`,
    eventKey: e.taskId,
    subject: subjectOf("idea", e.ideaId),
  };
}
