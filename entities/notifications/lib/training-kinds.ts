// The inbox lines the training routines produce (English Program PR 3): the
// prep draft is ready the morning before a session, and the session is today
// with each learner's homework standing. Both go to the organiser and lead to
// the session page on the team hub; the admin view has no session page.
import type { EventPayload } from "@/kernel/events";
import { BUSINESS_TIME_ZONE } from "@/kernel/config/dates";
import type { Draft } from "./kinds";

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: BUSINESS_TIME_ZONE });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: BUSINESS_TIME_ZONE });

export function prepReadyDraft(e: EventPayload<"training.prep.drafted">): Draft {
  const at = new Date(e.startsAt);
  return {
    personId: e.organiserId,
    kind: "training.prep_ready",
    title: `${DAY.format(at)}'s plan is ready to check: ${e.title}`,
    body: `${TIME.format(at)}. Swap exercises, edit timings, set the homework, then mark it checked.`,
    adminHref: null,
    teamHref: `/team/training/sessions/${e.trainingId}`,
    eventKey: e.trainingId,
  };
}

export function sessionTodayDraft(e: EventPayload<"training.session.today">): Draft {
  const at = new Date(e.startsAt);
  const lines = e.homework.map((h) => `${h.name}: homework ${h.submitted ? "submitted" : "not yet"}`);
  return {
    personId: e.organiserId,
    kind: "training.session_today",
    title: `Today ${TIME.format(at)}: ${e.title}`,
    body: lines.length ? lines.join(" · ") : null,
    adminHref: null,
    teamHref: `/team/training/sessions/${e.trainingId}`,
    eventKey: `${e.trainingId}:today`,
  };
}

const DAY_TIME = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: BUSINESS_TIME_ZONE });

/** One line per learner on the session: the homework and when it is due. */
export function homeworkDrafts(e: EventPayload<"training.homework.set">): Draft[] {
  return e.personIds.map((personId) => ({
    personId,
    kind: "training.homework_due",
    title: `Homework for ${e.title}, due ${DAY_TIME.format(new Date(e.dueAt))}`,
    body: "Submit it on My Training: write, upload, a link or a recording.",
    adminHref: null,
    teamHref: "/team/my-training",
    eventKey: e.assignmentId,
  }));
}

export function noteUpdatedDraft(e: EventPayload<"training.note.updated">): Draft {
  return {
    personId: e.personId,
    kind: "training.note_updated",
    title: `Your teacher updated their note on ${e.planTitle}`,
    body: "Strong points, weak points and what to work on now, on My Training.",
    adminHref: null,
    teamHref: "/team/my-training",
    eventKey: `${e.planId}:${new Date().toISOString().slice(0, 10)}`,
  };
}

export function recapReadyDraft(e: EventPayload<"training.recap.drafted">): Draft {
  return {
    personId: e.organiserId,
    kind: "training.recap_ready",
    title: `Recap to approve: ${e.title}, ${DAY_TIME.format(new Date(e.startsAt))}`,
    body: "Edit or approve it; one click folds a learner's line into their note.",
    adminHref: null,
    teamHref: `/team/training/sessions/${e.trainingId}`,
    eventKey: `${e.trainingId}:recap`,
  };
}

/** One line per learner the recap addresses: their own line is on My Training. */
export function recapPublishedDrafts(e: EventPayload<"training.recap.published">): Draft[] {
  return e.personIds.map((personId) => ({
    personId,
    kind: "training.recap_published",
    title: `Your recap of ${e.title}, ${DAY_TIME.format(new Date(e.startsAt))}`,
    body: "What we covered and your own line, on My Training.",
    adminHref: null,
    teamHref: `/team/my-training/sessions/${e.trainingId}`,
    eventKey: `${e.trainingId}:published`,
  }));
}

export function weeklyWaitingDraft(e: EventPayload<"training.weekly_recap.waiting">): Draft {
  return {
    personId: e.organiserId,
    kind: "training.weekly_recap_waiting",
    title: `Weekly recap of ${e.planTitle} is drafted: add or edit by Monday 08:00`,
    body: "Or send it now. It goes to the plan's recipients by email.",
    adminHref: null,
    teamHref: `/team/training/plans/${e.planId}/weekly/${e.weekStart}`,
    eventKey: `${e.planId}:${e.weekStart}:waiting`,
  };
}

export function weeklyHeldDrafts(e: EventPayload<"training.weekly_recap.held">, personIds: readonly string[]): Draft[] {
  return personIds.map((personId) => ({
    personId,
    kind: "training.weekly_recap_held",
    title: `No weekly recap of ${e.planTitle} this week`,
    body: e.reason,
    adminHref: null,
    teamHref: `/team/training/plans/${e.planId}/weekly/${e.weekStart}`,
    eventKey: `${e.planId}:${e.weekStart}:held`,
  }));
}
