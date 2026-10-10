import { addDays, diffDays, isoWeekKey } from "@/kernel/config/dates";
import { describeDay } from "./cadence";
import { dayInSentence, dayLabel } from "./day-choices";
import { formatLabel } from "./session-done";
import type { RowState } from "./row-state";

// The words on the coach's home page (K.82), pure so they can be tested and
// so the card, the header and the "waiting on you" sentence read one state.
// Research behind the page: a card answers what a phone call would — when you
// meet, their latest words, what changed, their goal on its own scale — and
// what needs the coach is said once, above the cards, never as a second list.

export type HomeRow = {
  profileId: string;
  name: string;
  state: RowState;
  checkinWritten: boolean;
  lastHeldOn: string | null;
  lastHeldFormat: string | null;
  nextStartsAt: string | null;
};

const first = (name: string) => name.split(" ")[0] || name;
const shortDay = (iso: string, today: string) => dayLabel(iso, today);
const inSentence = dayInSentence;

// What waits on the coach, one clause per person, in the people's order.
// Only real waits: a day they proposed, a session that passed unmarked, a first
// session to agree, a check-in sent for a session this week. A held 1-1 over
// a holiday is not a wait (L.2), so it is not listed.
export type WaitingItem = { profileId: string; first: string; text: string };

// The clause as read after the name: a possessive joins it, anything else
// takes a space ("Derek’s session…", "Minh proposed…").
export function afterName(item: WaitingItem): string {
  return item.text.startsWith("’") ? item.text : ` ${item.text}`;
}

export function waitingItems(rows: HomeRow[], today: string): WaitingItem[] {
  const out: WaitingItem[] = [];
  for (const r of rows) {
    const s = r.state;
    const name = first(r.name);
    if (s.kind === "member-proposed") out.push({ profileId: r.profileId, first: name, text: `proposed ${inSentence(s.on, today)}` });
    else if (s.kind === "missed" && s.worthPrompting)
      out.push({ profileId: r.profileId, first: name, text: `’s ${describeDay(s.on)} session isn’t marked done` });
    else if (s.kind === "none" && !s.everMet) out.push({ profileId: r.profileId, first: name, text: "has no first session yet" });
    else if (s.kind === "booked" && r.checkinWritten && isoWeekKey(s.on) === isoWeekKey(today))
      out.push({ profileId: r.profileId, first: name, text: `sent a check-in for ${inSentence(s.on, today)}` });
  }
  return out;
}

// The header's one line: today, how many people, what is left this week. It
// counts sessions, never people's results, and it never says "nothing is
// waiting" — that is the waiting sentence's job, which reads the same state.
export function homeSummary(rows: HomeRow[], today: string): string {
  const left = rows.filter((r) => r.state.kind === "booked" && r.state.on >= today && isoWeekKey(r.state.on) === isoWeekKey(today)).length;
  const people = `${rows.length} ${rows.length === 1 ? "person" : "people"}`;
  const week = left === 0 ? "no sessions left this week" : `${left} ${left === 1 ? "session" : "sessions"} left this week`;
  return `${describeDay(today)} · ${people} · ${week}`;
}

// The card's "when" line: the next thing on the calendar between the two of
// them, and how the last session happened when the coach said.
export function cardWhen(r: HomeRow, today: string): string {
  const s = r.state;
  const how = formatLabel(r.lastHeldFormat);
  const last = r.lastHeldOn
    ? `Met ${diffDays(r.lastHeldOn, today) === 1 ? "yesterday" : r.lastHeldOn === today ? "today" : `on ${shortDay(r.lastHeldOn, today)}`}${how ? ` · ${how.toLowerCase()}` : ""}`
    : null;
  switch (s.kind) {
    case "booked":
      return `Next: ${shortDay(s.on, today)}${r.nextStartsAt ? `, ${r.nextStartsAt}` : ""}`;
    case "member-proposed":
      return `They proposed ${shortDay(s.on, today)}`;
    case "missed":
      return s.worthPrompting ? `${describeDay(s.on)} session · not marked done` : `${describeDay(s.on)} fell in their time off`;
    case "coach-proposed":
      return `You proposed ${shortDay(s.on, today)}`;
    case "none":
      if (!s.everMet) return "No first session yet";
      return [last, s.suggestedOn ? `next: ${shortDay(s.suggestedOn, today)} keeps the rhythm` : "nothing booked"]
        .filter(Boolean)
        .join(" · ");
  }
}

// "Since 24 Sep: 2 new talking points · 1 kept · 1 stuck". Parts that would
// be zero are left out; a quiet stretch says so in words.
export function sinceLine(
  lastHeldOn: string | null,
  today: string,
  f: { topicsFromThem: number; kept: number; stuck: number; onTheGo: number },
): { label: string; text: string } {
  const label = lastHeldOn ? `Since ${lastHeldOn === addDays(today, -1) ? "yesterday" : shortDay(lastHeldOn, today)}:` : "So far:";
  const parts: string[] = [];
  if (f.topicsFromThem > 0) parts.push(`${f.topicsFromThem} new talking ${f.topicsFromThem === 1 ? "point" : "points"}`);
  if (f.kept > 0) parts.push(`${f.kept} kept`);
  if (f.stuck > 0) parts.push(`${f.stuck} stuck`);
  if (f.onTheGo > 0) parts.push(`${f.onTheGo} on the go`);
  return { label, text: parts.length > 0 ? parts.join(" · ") : "nothing new yet" };
}
