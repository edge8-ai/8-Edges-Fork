import { diffDays } from "@/kernel/config/dates";

// When the member's own agenda window is open, and what to say about it on a
// page that is not My Coach (L.7).
//
// There are two windows in this entity and they are different on purpose.
// `AGENDA_LEAD_DAYS` (2) in help-lines.ts is the COACH's: the day the roster
// starts telling them to write the prep. This one is the MEMBER's, and it opens
// earlier — a member writes ninety seconds of their own words and wants a
// couple of evenings to think, where a coach writes the agenda from the ledger
// in one sitting.
//
// It lives here rather than inline in the My Coach route because a second
// screen now asks the same question, and two screens disagreeing about whether
// a form is open is the kind of bug nobody reports: they just stop trusting the
// prompt.
export const MEMBER_AGENDA_LEAD_DAYS = 4;

/**
 * Whether the member has written anything into the pre-meeting form.
 *
 * Three screens asked this by spelling the same `||` out, which is how the
 * question quietly becomes three questions: add a fourth field to the form and
 * two of them keep answering about three. One field is enough — the form is
 * optional, so any word at all means they engaged with it.
 */
export function preMeetingAnswered(answers: {
  moved: string | null;
  stuck: string | null;
  talk: string | null;
}): boolean {
  return Boolean(answers.moved || answers.stuck || answers.talk);
}

export type AgendaWindow = {
  /** The next 1-1's Saigon date, or null when none is booked. */
  nextOn: string | null;
  /** True once the member has written anything into the pre-meeting form. */
  answered: boolean;
};

/**
 * Whether the member's pre-meeting form should be open.
 *
 * Anything already written keeps it open whatever the date says: once a member
 * has put words in, those words have to stay readable and editable, and a form
 * that closes over someone's draft has eaten it as far as they can tell. That
 * is why `answered` is checked before the dates and not after.
 *
 * With nothing written, the window has two ends. The far end is the lead time;
 * the near end is today, and it was missing (K.68). `hubOneOnOnePrompt` below
 * has always refused a past date — its docstring says a 1-1 that did not happen
 * is the missed prompt's business on My Coach — so the hub stayed quiet while
 * this function held the form open for a meeting that was already over. The two
 * screens now give the same answer for every date, which is what
 * my-coaching-page.ts has always told the reader they do.
 */
export function memberAgendaOpen(w: AgendaWindow, todayISO: string): boolean {
  if (w.answered) return true;
  if (!w.nextOn) return false;
  const away = diffDays(todayISO, w.nextOn);
  return away >= 0 && away <= MEMBER_AGENDA_LEAD_DAYS;
}

export type HubPrompt = { text: string; cta: string; href: string };

/**
 * The one line the team hub shows about an upcoming 1-1 (L.7), or null.
 *
 * Null is the normal state and the important one. This returns something only
 * when there is a 1-1 close enough to prepare for AND the member has not
 * written anything yet — so the line is an answer to "is there something for me
 * to do", never a permanent band. A band that is always there becomes furniture
 * within a fortnight, and then it is a nag nobody reads.
 *
 * A date in the past returns null too: a 1-1 that did not happen is the missed
 * prompt's business on My Coach, not a cheerful reminder on the hub.
 */
export function hubOneOnOnePrompt(
  input: { coachName: string | null; nextOn: string | null; answered: boolean; weekday: string | null },
  todayISO: string,
): HubPrompt | null {
  if (input.answered || !input.nextOn) return null;
  const away = diffDays(todayISO, input.nextOn);
  if (away < 0 || away > MEMBER_AGENDA_LEAD_DAYS) return null;

  const when = away === 0 ? "today" : away === 1 ? "tomorrow" : (input.weekday ?? `in ${away} days`);
  const who = input.coachName ? ` with ${input.coachName}` : "";
  return {
    text: `1-1${who} ${when}. Your agenda is yours to set.`,
    cta: "Ninety seconds",
    // Straight to the member's own page, never /team/coaching — that is the
    // coach's roster, and a member who is not a coach cannot open it.
    href: "/team/my-coaching?tab=my",
  };
}
