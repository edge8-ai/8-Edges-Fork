// A training plan's rhythm (TR.5): which weekdays it meets, at what time, and
// the occurrences that gives between two dates. Pure, so publishing and its
// tests agree on exactly which trainings a rhythm produces, and nothing but
// the organiser's chosen end date decides how many.
//
// Times are Vietnam time, where every plan so far meets. Vietnam keeps +07:00
// all year, so the offset is fixed and no DST rule is needed (training-rules
// makes the same choice). A plan in another zone is a later change: the zone is
// stored so the data is right from the start, and refused until the code
// handles it.
import { z } from "zod";
import { saigonRange } from "./training-rules";

export const PLAN_ZONE = "Asia/Ho_Chi_Minh";
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const Rhythm = z
  .object({
    // ISO weekdays, Monday 1 to Sunday 7.
    weekdays: z.array(z.number().int().min(1).max(7)).min(1, "Pick at least one weekday.").max(7).transform((d) => [...new Set(d)].sort()),
    start: z.string().regex(TIME, "Pick a start time."),
    end: z.string().regex(TIME, "Pick an end time."),
    tz: z.literal(PLAN_ZONE).default(PLAN_ZONE),
  })
  .refine((r) => minutesOf(r.start) < minutesOf(r.end), { message: "The session must end after it starts.", path: ["end"] });
export type RhythmType = z.infer<typeof Rhythm>;

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** How long one session lasts, in minutes. */
export function sessionMinutes(r: Pick<RhythmType, "start" | "end">): number {
  return minutesOf(r.end) - minutesOf(r.start);
}

/** The ISO weekday (Monday 1 to Sunday 7) of a YYYY-MM-DD date. */
function isoWeekday(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

function nextDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export type Occurrence = { date: string; startsAt: string; endsAt: string };

/**
 * Every session the rhythm gives from `from` to `until`, both inclusive, in
 * date order. Empty when `until` is before `from`.
 */
export function occurrencesFor(rhythm: RhythmType, from: string, until: string): Occurrence[] {
  const days = new Set(rhythm.weekdays);
  const minutes = sessionMinutes(rhythm);
  const out: Occurrence[] = [];
  for (let date = from; date <= until; date = nextDate(date)) {
    if (!days.has(isoWeekday(date))) continue;
    out.push({ date, ...saigonRange(date, rhythm.start, minutes) });
  }
  return out;
}

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "Tue, Thu 14:00–15:15": the rhythm as the page says it. */
export function rhythmLabel(r: RhythmType): string {
  return `${r.weekdays.map((d) => DAY_NAMES[d]).join(", ")} ${r.start}–${r.end}`;
}
