import { dateMs, diffDays } from "@/kernel/config/dates";
import { WEEKDAY_NAMES } from "@/entities/coaching/lib/cadence";

// "Since Tuesday" (K.44): one sentence of the member's own story between the
// last held 1-1 and today. It is prose, not a checklist — no checkboxes, no
// totals held up as a score, and nothing about anyone else. The composer is
// pure so the wording can be tested without a page, and so the page only has
// to hand it facts it already loaded.

export type SinceFacts = {
  // The Saigon date of the last held 1-1; the window starts there.
  lastHeldOn: string;
  // Commitments the member kept since that meeting.
  kept: number;
  // Notes the member wrote since that meeting.
  notes: number;
  // The goal's measure at the meeting and now, when the page can tell both
  // cheaply; null when the before value is not recorded anywhere yet, and then
  // the goal simply goes unmentioned rather than being guessed at.
  goal: { before: number; after: number; unit: string | null } | null;
  // Workboard cards the member finished since that meeting.
  cards: number;
};

export type SinceLine = {
  // "Since Tuesday" or "Since 3 Sep": the same lead in both states, so the
  // sentence and the empty state read as one voice.
  lead: string;
  // The rest of the sentence, already punctuated.
  body: string;
  // True when nothing happened in the window, which is the state that offers
  // the board rather than a summary.
  empty: boolean;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Within the last six days the weekday alone is unambiguous and is how people
// talk ("since Tuesday"); at seven days it would name the wrong week, so from
// there on the line uses the date. A meeting dated in the future — a clock
// skew, or a held_on typed ahead — falls to the date too, because no weekday
// reading of it would be true.
function name(lastHeldOn: string, todayISO: string): string {
  const ago = diffDays(lastHeldOn, todayISO);
  if (ago >= 0 && ago <= 6) return WEEKDAY_NAMES[new Date(dateMs(lastHeldOn)).getUTCDay()];
  const d = new Date(dateMs(lastHeldOn));
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

// A plain English list: one clause alone, two joined by "and", three or more
// with the serial comma, which is what the sentence reads like out loud.
function join(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export function sinceLine(facts: SinceFacts, todayISO: string): SinceLine {
  const when = name(facts.lastHeldOn, todayISO);
  const parts: string[] = [];

  // Kept first: it is the promise the last 1-1 ended on, so it is the part of
  // the story the member is most likely to be looking for.
  if (facts.kept > 0) parts.push(`kept ${facts.kept} ${facts.kept === 1 ? "thing" : "things"} you promised`);
  if (facts.cards > 0) parts.push(`finished ${facts.cards} ${facts.cards === 1 ? "card" : "cards"} on your board`);
  // A bump is only worth a clause when the number actually moved; a goal
  // re-saved at the same value is not news.
  if (facts.goal && facts.goal.after !== facts.goal.before) {
    const unit = facts.goal.unit ? ` ${facts.goal.unit}` : "";
    parts.push(`moved your goal from ${facts.goal.before} to ${facts.goal.after}${unit}`);
  }
  if (facts.notes > 0) parts.push(`wrote ${facts.notes} ${facts.notes === 1 ? "note" : "notes"}`);

  if (parts.length === 0) {
    return { lead: `Since ${when}`, body: `Nothing yet since ${when} — the board is right here.`, empty: true };
  }
  return { lead: `Since ${when}`, body: `You ${join(parts)}.`, empty: false };
}
