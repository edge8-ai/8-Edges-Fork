// Marking a coaching session done (K.80). The pure half: which row a "done"
// lands on, and the words the employee receives.
//
// A session is done when the coach says it is. It may have been a video call,
// a phone call, a coffee or a chat thread, on the booked day, earlier, or with
// nothing booked at all; none of that is a reason to refuse it. Until K.80 the
// only ways to close a 1-1 were pasting a transcript, waiting for the booked
// day to pass and then "marking it held", or a "log a past 1-1" form that
// wanted a date and a transcript. Coaches did not use any of them.

export type SessionRow = { id: string; day: string };

export type SessionTarget =
  // A booking whose day went by unanswered is the session being closed: it
  // keeps its day and is marked held late, the way the missed prompt does it.
  | { kind: "close-passed"; row: SessionRow }
  // The booking on the day the session happened.
  | { kind: "close-booked"; row: SessionRow }
  // A booking still ahead, and the coach says this WAS that session, held
  // sooner: the booking moves to the day they met and closes there.
  | { kind: "close-early"; row: SessionRow }
  // Nothing booked, or the coach says it was an extra conversation: the
  // session is recorded on its own day and any booking ahead stands.
  | { kind: "record"; day: string };

// What the coach says the session was, when a booking is ahead. Only the coach
// knows whether today's chat was Thursday's 1-1 held early or an extra one, so
// the panel asks; guessing "it was the booking" ate Thursday's session every
// time a coach logged an ad-hoc conversation or an older one (K.80 review).
export type SessionWhich = "booked" | "extra";

export function sessionTarget(
  schedule: { booked: SessionRow | null; awaiting: SessionRow | null },
  day: string,
  which: SessionWhich = "booked",
): SessionTarget {
  if (schedule.awaiting && which === "booked") return { kind: "close-passed", row: schedule.awaiting };
  if (schedule.booked && which === "booked") {
    return schedule.booked.day === day
      ? { kind: "close-booked", row: schedule.booked }
      : { kind: "close-early", row: schedule.booked };
  }
  return { kind: "record", day };
}

// The four ways a session can happen, as the column stores them, and how the
// pages say them. None is better than another, and none is required.
export const SESSION_FORMATS = ["video", "call", "in_person", "chat"] as const;
export type SessionFormat = (typeof SESSION_FORMATS)[number];
export const SESSION_FORMAT_LABELS: Record<SessionFormat, string> = {
  video: "Video",
  call: "Call",
  in_person: "In person",
  chat: "Chat",
};

// "Call", or null for no format or one this code does not know.
export function formatLabel(format: string | null): string | null {
  return format && format in SESSION_FORMAT_LABELS ? SESSION_FORMAT_LABELS[format as SessionFormat] : null;
}

// The one line the employee gets. It asks for their own update rather than
// reporting one: growth on this page is self-reported, and the coach marking
// a session done never writes the employee's goal for them (Khoa, 2026-10-06).
export function sessionDoneText(input: { coachName: string; dayLabel: string; hasNote: boolean }): string {
  const note = input.hasNote ? " and left you a note" : "";
  return (
    `${input.coachName} marked your 1-1 on ${input.dayLabel} done${note}. ` +
    "Take a minute to update your FAST goal or write a short reflection."
  );
}
