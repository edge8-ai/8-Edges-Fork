// The training block at the top of My Training (TR.12, the canvas Khoa approved
// on 2026-11-03): the member's last eight weeks as columns of capsules, their
// own usual week behind them, the goal they set, and a shelf of firsts and
// certificates. Pure: the page reads the rows and hands them here, so every
// rule below is tested without a database.
//
// What it never does: compare the member with anyone, count a streak, or say a
// week was missed. A week with nothing in it is just a short column.
import { addDays, businessDate, isoWeekKey, isoWeekMonday } from "@/kernel/config/dates";
import { typeTone } from "./training-format";
import type { MyTrainingRow } from "./training-rules";

export const BLOCK_WEEKS = 8;
// The usual week needs this many past weeks with a training before it is drawn,
// so one busy week does not become the member's "usual".
export const USUAL_MIN_WEEKS = 4;
// The goals the chips offer, in minutes a week; the database takes 15 to 1200.
export const GOAL_CHOICES = [60, 90, 120, 150, 180] as const;
export const GOAL_MIN = 15;
export const GOAL_MAX = 1200;
// A training longer than this is drawn at this height, so one all-day workshop
// does not flatten every other week into a line.
const CAPSULE_CAP = 240;

export type CapsuleState = "went" | "skipped" | "waiting";

export type Capsule = {
  key: string;
  title: string;
  typeName: string;
  tone: string;
  minutes: number;
  state: CapsuleState;
};

export type BlockWeek = {
  // The Monday the week starts on, in Vietnam time.
  monday: string;
  label: string;
  isNow: boolean;
  capsules: Capsule[];
  // Minutes of training the member went to that week.
  wentMinutes: number;
};

export type BlockView = {
  weeks: BlockWeek[];
  // The middle half of the member's own past weeks, or null until enough weeks have a training.
  usual: { low: number; high: number } | null;
  // Minutes the member went to this week, and minutes still on the calendar.
  thisWeek: { went: number; waiting: number };
  // The height the chart is drawn to, in minutes.
  scale: number;
};

const ms = (iso: string) => new Date(iso).getTime();

export function minutesOf(r: Pick<MyTrainingRow, "startsAt" | "endsAt">): number {
  const m = Math.round((ms(r.endsAt) - ms(r.startsAt)) / 60000);
  return Number.isFinite(m) && m > 0 ? m : 0;
}

function stateOf(r: Pick<MyTrainingRow, "status">): CapsuleState {
  if (r.status === "attended") return "went";
  if (r.status === "skipped" || r.status === "absent") return "skipped";
  return "waiting";
}

// "15 Sep": written out rather than through Intl, whose en-GB data says "Sept"
// for September on some runtimes and "Sep" on others.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayMonth = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;

/** The Monday of the week a day falls in. */
export function mondayOf(day: string): string {
  return isoWeekMonday(isoWeekKey(day)) ?? day;
}

/** The middle half of a list of numbers: its lower and upper quartile. */
export function middleHalf(values: number[]): { low: number; high: number } {
  const v = [...values].sort((a, b) => a - b);
  const at = (q: number) => {
    const i = (v.length - 1) * q;
    const lo = Math.floor(i);
    return v[lo] + (v[Math.ceil(i)] - v[lo]) * (i - lo);
  };
  const round5 = (n: number) => Math.round(n / 5) * 5;
  return { low: round5(at(0.25)), high: round5(at(0.75)) };
}

export function trainingBlock(rows: MyTrainingRow[], goal: number | null, now: Date): BlockView {
  const thisMonday = mondayOf(businessDate(now));
  const mondays = Array.from({ length: BLOCK_WEEKS }, (_, i) => addDays(thisMonday, (i - (BLOCK_WEEKS - 1)) * 7));
  const byWeek = new Map(mondays.map((m) => [m, [] as MyTrainingRow[]]));
  for (const r of rows) byWeek.get(mondayOf(businessDate(r.startsAt)))?.push(r);

  const weeks = mondays.map((monday): BlockWeek => {
    const inWeek = (byWeek.get(monday) ?? []).sort((a, b) => ms(a.startsAt) - ms(b.startsAt));
    const capsules = inWeek.map((r) => ({
      key: r.attendanceId,
      title: r.title,
      typeName: r.typeName,
      tone: typeTone(r.typeRank),
      minutes: Math.min(minutesOf(r), CAPSULE_CAP),
      state: stateOf(r),
    }));
    const wentMinutes = inWeek.filter((r) => stateOf(r) === "went").reduce((s, r) => s + minutesOf(r), 0);
    return { monday, label: monday === thisMonday ? "This week" : dayMonth(monday), isNow: monday === thisMonday, capsules, wentMinutes };
  });

  const past = weeks.filter((w) => !w.isNow && w.wentMinutes > 0).map((w) => w.wentMinutes);
  const usual = past.length >= USUAL_MIN_WEEKS ? middleHalf(past) : null;
  const now0 = weeks[weeks.length - 1];
  const thisWeek = {
    went: now0.wentMinutes,
    waiting: now0.capsules.filter((c) => c.state === "waiting").reduce((s, c) => s + c.minutes, 0),
  };
  const tallest = Math.max(0, ...weeks.map((w) => w.capsules.reduce((s, c) => s + c.minutes, 0)));
  // Room for the tallest week, the usual band and the goal line, to the next hour.
  const scale = Math.max(120, Math.ceil(Math.max(tallest, usual?.high ?? 0, goal ?? 0) / 60) * 60);
  return { weeks, usual, thisWeek, scale };
}

export type GoalView = { set: boolean; met: boolean; share: number; note: string };

/** What the ring says about this week against the member's goal. */
export function goalView(goal: number | null, went: number, waiting: number): GoalView {
  if (goal === null) return { set: false, met: false, share: 0, note: "Set one if it helps. Nobody else sees it, and a missed week just ends." };
  const met = went >= goal;
  if (met) return { set: true, met, share: 1, note: "Done. Anything more this week is a bonus." };
  const booked = waiting > 0 ? ` · ${waiting} min booked` : "";
  return { set: true, met, share: went / goal, note: `${goal - went} min to go${booked}. Only you see this.` };
}

export type ShelfBadge =
  | { kind: "certificate"; key: string; name: string; when: string }
  | { kind: "first"; key: string; name: string; when: string; tone: string }
  | { kind: "not-yet"; key: string; name: string; tone: string };

/**
 * The shelf: each certificate the provider awarded, newest first, then the
 * first training of each type the member went to, newest first, then each live
 * type they have not tried yet, which sits dashed as "Not yet".
 */
export function shelf(
  rows: Pick<MyTrainingRow, "typeId" | "typeName" | "typeRank" | "status" | "startsAt">[],
  types: { id: string; name: string; rank: number }[],
  awards: { key: string; label: string; awardedAt: string }[],
): ShelfBadge[] {
  const firstOf = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    if (r.status !== "attended") continue;
    const had = firstOf.get(r.typeId);
    if (!had || ms(r.startsAt) < ms(had.startsAt)) firstOf.set(r.typeId, r);
  }
  const certificates: ShelfBadge[] = [...awards]
    .sort((a, b) => ms(b.awardedAt) - ms(a.awardedAt))
    .map((a) => ({ kind: "certificate", key: `cert:${a.key}`, name: a.label, when: dayMonth(businessDate(a.awardedAt)) }));
  const firsts: ShelfBadge[] = [...firstOf.values()]
    .sort((a, b) => ms(b.startsAt) - ms(a.startsAt))
    .map((r) => ({ kind: "first", key: `first:${r.typeId}`, name: `First ${r.typeName.toLowerCase()}`, when: dayMonth(businessDate(r.startsAt)), tone: typeTone(r.typeRank) }));
  const notYet: ShelfBadge[] = types
    .filter((t) => !firstOf.has(t.id))
    .map((t) => ({ kind: "not-yet", key: `first:${t.id}`, name: `First ${t.name.toLowerCase()}`, tone: typeTone(t.rank) }));
  return [...certificates, ...firsts, ...notYet];
}
