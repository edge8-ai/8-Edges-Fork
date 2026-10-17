import { addDays, isWeekend } from "@/kernel/config/dates";
import { describeDay } from "./cadence";

// The days and times the booking picker offers as one-click choices (K.80).
// A date field and a time field were the whole booking UI, and a coach booking
// three 1-1s typed six values into two browser widgets. Most bookings are one
// of a handful of answers — the day that keeps the rhythm, or one of the next
// few working days, at the time the person said suits them — so those are
// buttons, and the browser's own pickers stay one click away for anything else.

// The next `count` working days from `fromIso` (inclusive), with the suggested
// day first when there is one and it has not passed.
export function dayChoices(fromIso: string, suggestedOn: string | null, count = 5): string[] {
  const days: string[] = [];
  if (suggestedOn && suggestedOn >= fromIso) days.push(suggestedOn);
  let d = fromIso;
  while (days.length < count) {
    if (!isWeekend(d) && !days.includes(d)) days.push(d);
    d = addDays(d, 1);
  }
  return days;
}

// Common start times, with the person's own preference first when they gave
// one. "HH:MM", 24-hour, which is what the time column stores.
const STANDARD_TIMES = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"];

export function timeChoices(preferred: string | null): string[] {
  return preferred ? [preferred, ...STANDARD_TIMES.filter((t) => t !== preferred)] : STANDARD_TIMES;
}

// "9:00", "14:30" — the chip's label. The stored value keeps its leading zero.
export function timeLabel(hhmm: string): string {
  return hhmm.replace(/^0(\d)/, "$1");
}

// "Today", "Tomorrow", "Yesterday", else "Thu 8 Oct": short enough for a chip, and the
// first two are what a person actually says when picking a day.
export function dayLabel(iso: string, todayIso: string): string {
  if (iso === todayIso) return "Today";
  if (iso === addDays(todayIso, 1)) return "Tomorrow";
  if (iso === addDays(todayIso, -1)) return "Yesterday";
  const [weekday, ...rest] = describeDay(iso).split(" ");
  return [weekday.slice(0, 3), ...rest].join(" ");
}

// Mid-sentence, the relative days are lower case and dates keep theirs:
// "wants to talk about, today" but "what moved, Mon 5 Oct".
export function dayInSentence(iso: string, todayIso: string): string {
  return dayLabel(iso, todayIso).replace(/^(Today|Tomorrow|Yesterday)$/, (w) => w.toLowerCase());
}
