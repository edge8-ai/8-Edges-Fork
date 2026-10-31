// What the plain view draws where the game draws a fire (QS.14 Part C; the
// plain artboard Khoa approved on 2026-10-25,
// https://claude.ai/artifact/7gESgF2mDZ4T5z3xy3UxA1). A session with a time
// shows a calendar leaf with its day, so its meta line keeps the hour only; a
// topic shows a three-dot meter of the hands it needs, with "+1" for each hand
// past three. Neither is art: no flame, no logs, and no plant, which stays the
// bounty's. Both are aria-hidden, because the card says the same in words: the
// meta line carries the day as screen-reader text beside the visible hour
// (campfire-cards.tsx), and the hands line counts the hands.
import { BUSINESS_TIME_ZONE } from "@/kernel/config/dates";
import { HANDS_FOR_A_FIRE } from "../lib/campfires-model";

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIME_ZONE, weekday: "short" });
const DAY = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIME_ZONE, day: "numeric" });
const MONTH = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIME_ZONE, month: "short" });

/** A session's day on its calendar leaf, in Saigon: "Thu", "29", "Oct". */
export function calendarLeaf(startsAt: string): { weekday: string; day: string; month: string } {
  const at = new Date(startsAt);
  return { weekday: WEEKDAY.format(at), day: DAY.format(at), month: MONTH.format(at) };
}

/** The hands meter: how many of the three dots are filled, and the hands past three ("+1"), null at three or fewer. */
export function handsMeter(hands: number): { filled: number; past: string | null } {
  const past = hands - HANDS_FOR_A_FIRE;
  return { filled: Math.max(0, Math.min(HANDS_FOR_A_FIRE, hands)), past: past > 0 ? `+${past}` : null };
}

export function CalendarLeaf({ startsAt }: { startsAt: string }) {
  const leaf = calendarLeaf(startsAt);
  return (
    <div className="qn-cal" aria-hidden="true">
      <span className="qn-cal-d">{leaf.weekday}</span>
      <b>{leaf.day}</b>
      <span className="qn-cal-m">{leaf.month}</span>
    </div>
  );
}

export function HandDots({ hands }: { hands: number }) {
  const { filled } = handsMeter(hands);
  return (
    <span className="qn-dots" aria-hidden="true">
      {Array.from({ length: HANDS_FOR_A_FIRE }, (_, i) => (
        <i key={i} className={i < filled ? "on" : undefined} />
      ))}
    </span>
  );
}

/** The cold card's lead: the three dots in a tinted tile, and the hands past three under them. */
export function HandsMeter({ hands }: { hands: number }) {
  const { past } = handsMeter(hands);
  return (
    <div className="qn-hands" aria-hidden="true">
      <HandDots hands={hands} />
      {past && <small>{past}</small>}
    </div>
  );
}
