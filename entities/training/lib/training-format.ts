// How a training's time reads on the page (TR.2): "Thu 9 Oct · 16:00 · 1 h",
// always in Vietnam time, where the times were entered. Pure, so the page and
// its tests agree.
import { BUSINESS_TIME_ZONE } from "@/kernel/config/dates";
import { answerLine, finalAt, windowStart, wordOpen, type AttendanceStatus, type MyReview, type MyTrainingRow, type SkipReason } from "./training-rules";

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: BUSINESS_TIME_ZONE });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: BUSINESS_TIME_ZONE });

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: BUSINESS_TIME_ZONE });

/** "October 2026": the month a training falls in, in Vietnam time. */
export function monthLabel(at: string): string {
  return MONTH.format(new Date(at));
}

/** "1 h", "1.5 h", "45 min": a length the way people say it. */
export function lengthLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} h`;
}

export function minutesBetween(startsAt: string, endsAt: string): number {
  return Math.max(0, Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000));
}

export function whenLabel(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  return `${DAY.format(start).replace(",", "")} · ${TIME.format(start)} · ${lengthLabel(minutesBetween(startsAt, endsAt))}`;
}

/** The parts a form needs to show a training's time back: a date, a start, a length. */
export function formParts(startsAt: string, endsAt: string): { date: string; start: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: BUSINESS_TIME_ZONE })
      .formatToParts(new Date(startsAt))
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, start: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`, minutes: minutesBetween(startsAt, endsAt) };
}

/** Which of the page's type colours a type wears, by its place in the list. */
export const typeTone = (rank: number) => `tr-type-${((rank % 6) + 6) % 6}`;

/** The type, and who put it on the record: the organiser, or "logged by you". */
export function trainingMeta(r: Pick<MyTrainingRow, "typeName" | "selfLogged" | "organiserName">): string {
  return `${r.typeName} · ${r.selfLogged ? "logged by you" : `by ${r.organiserName ?? "an organiser"}`}`;
}

/** How long the member's word stays open, from its window's start: "Open 5 more days", "Open 1 more day", then "Open until 17:00" on the last. */
export function closesLabel(from: string, now: Date): string {
  const until = new Date(finalAt(from));
  const days = Math.floor((until.getTime() - now.getTime()) / 86_400_000);
  if (days >= 2) return `Open ${days} more days`;
  if (days === 1) return "Open 1 more day";
  return `Open until ${TIME.format(until)}`;
}

/** The moment a training's answer and review become final, from its window's start: "Fri 16 Oct, 17:00". */
export function finalOnLabel(from: string): string {
  const until = new Date(finalAt(from));
  return `${DAY.format(until).replace(",", "")}, ${TIME.format(until)}`;
}

/** One row of the Cool-down tray or the log, as the browser gets it: plain values, worked out on the server. */
export type WordView = {
  attendanceId: string;
  // What the member's actions name the row by, with their own person id (A.40).
  trainingId: string;
  title: string;
  when: string;
  meta: string;
  tone: string;
  status: AttendanceStatus;
  skipReason: SkipReason | null;
  review: MyReview | null;
  // Whether the member may still answer, review, change or remove.
  open: boolean;
  closes: string;
  finalOn: string;
  line: string;
};

export function wordView(r: MyTrainingRow, now: Date): WordView {
  const from = windowStart(r);
  return {
    attendanceId: r.attendanceId,
    trainingId: r.trainingId,
    title: r.title,
    when: whenLabel(r.startsAt, r.endsAt),
    meta: trainingMeta(r),
    tone: typeTone(r.typeRank),
    status: r.status,
    skipReason: r.skipReason,
    review: r.review,
    open: wordOpen(from, now),
    closes: closesLabel(from, now),
    finalOn: finalOnLabel(from),
    line: answerLine(r),
  };
}
