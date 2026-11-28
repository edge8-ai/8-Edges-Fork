// The pure side of the weekly recap (English Program PR 9, ADR 0015): the
// draft's shape, the steps a row moves through, the one function that decides
// the next step from the row and the clock, the validator that lets the
// progress lines say only what the learners have already seen, and the week
// arithmetic. No server import, so the page and the tests share it.
import { z } from "zod";
import { addDays, isoWeekMonday, isoWeekKey } from "@/kernel/config/dates";

const Md = z.string().trim().max(8000);

/** What will be sent (training_weekly_recaps.draft). */
export const WeeklyDraft = z.object({
  this_week: Md.min(1),
  attendance: Md,
  progress: z.array(z.object({ person_id: z.string().uuid(), md: Md.min(1) })),
  next_week: Md,
});
export type WeeklyDraftType = z.infer<typeof WeeklyDraft>;

export const STEPS = ["drafting", "waiting", "sending", "sent", "held", "failed"] as const;
export type Step = (typeof STEPS)[number];
export const STEP_LABEL: Record<Step, string> = { drafting: "Drafting", waiting: "Waiting for you", sending: "Sending", sent: "Sent", held: "Held", failed: "Send failed, retrying" };

/** Sending stops after this many failed attempts; the organiser is told. */
export const MAX_SEND_ATTEMPTS = 3;

export type RecapRow = { step: Step; sendAfter: string | null; attempts: number; draft: WeeklyDraftType | null };
export type RecapEvent = { kind: "drafted"; draft: WeeklyDraftType; sendAfter: string } | { kind: "send-now" } | { kind: "hold"; reason: string } | { kind: "sent" } | { kind: "send-failed"; error: string } | { kind: "tick" };

/**
 * The one transition table. Returns the patch the row takes, or null when
 * nothing changes: a tick on a waiting row before its deadline, a Send on a
 * row already sent, a hold on a sent row.
 */
export function nextStep(row: RecapRow, event: RecapEvent, now: Date): Partial<RecapRow> & { step: Step; error?: string | null; holdReason?: string } | null {
  switch (event.kind) {
    case "drafted":
      return row.step === "drafting" ? { step: "waiting", draft: event.draft, sendAfter: event.sendAfter } : null;
    case "send-now":
      return row.step === "waiting" || row.step === "failed" ? { step: "sending" } : null;
    case "hold":
      return row.step === "waiting" || row.step === "failed" ? { step: "held", holdReason: event.reason } : null;
    case "sent":
      return row.step === "sending" ? { step: "sent", error: null } : null;
    case "send-failed":
      return row.step === "sending" ? { step: "failed", attempts: row.attempts + 1, error: event.error } : null;
    case "tick":
      if (row.step === "waiting" && row.sendAfter && new Date(row.sendAfter).getTime() <= now.getTime()) return { step: "sending" };
      if (row.step === "failed" && row.attempts < MAX_SEND_ATTEMPTS) return { step: "sending" };
      return null;
  }
}

/**
 * The progress lines may only paraphrase what the learners have already seen:
 * every person in them must have at least one published recap line that week.
 * Nothing from a review, attendance word or skip reason ever reaches this
 * draft; the inputs are built that way and this is the check on the output.
 */
export function validateProgress(draft: WeeklyDraftType, publishedFor: ReadonlySet<string>): { ok: true } | { ok: false; error: string } {
  const stranger = draft.progress.find((p) => !publishedFor.has(p.person_id));
  if (stranger) return { ok: false, error: `The draft wrote about a learner with no published recap line this week (${stranger.person_id}).` };
  return { ok: true };
}

/** The Monday of the ISO week a date falls in, YYYY-MM-DD. */
export function weekStartOf(date: string): string {
  return isoWeekMonday(isoWeekKey(date)) ?? date;
}

/** The week's label on the page: "Week 42 · 13–17 Oct". */
export function weekLabel(weekStart: string): string {
  const fmt = (d: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const key = isoWeekKey(weekStart);
  return `Week ${key.split("-W")[1] ?? "?"} · ${fmt(weekStart).split(" ")[0]}–${fmt(addDays(weekStart, 4))}`;
}

/**
 * Whether the week's recaps open now: on the Saigon date `today` when it is a
 * Friday, from 16:00 Vietnam time. The weekday is read at UTC noon of that date,
 * which is the same date in Saigon; reading it at Saigon midnight gives the day
 * before in UTC, which is how the rows came to open on Saturdays (Z.20).
 */
export function fridayOpensWeek(today: string, now: Date): boolean {
  return new Date(`${today}T12:00:00Z`).getUTCDay() === 5 && now.getTime() >= Date.parse(`${today}T16:00:00+07:00`);
}

/**
 * The deadline: the Monday after the week, 09:00 in Vietnam (02:00 UTC), when
 * the working window opens (Z.20, CLAUDE.md "Working hours"). It was 08:00
 * until 2026-11-16, which reached the Edge8 leaders on the list before their
 * day had started.
 */
export function sendAfterFor(weekStart: string): string {
  return `${addDays(weekStart, 7)}T02:00:00.000Z`;
}

/** The subject carries the programme and the week, never a learner's name. */
export function subjectFor(planTitle: string, weekStart: string): string {
  return `${planTitle} · ${weekLabel(weekStart)}`;
}
