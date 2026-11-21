// The rules a training stands on (TR.2, spec 2026-10-11), as pure functions so
// every write and every page asks the same question the same way.
//
// - An organiser may move, cancel or change who is on a training until it
//   starts; after that only its title and notes. A cancelled training changes
//   no further.
// - A member's word is wanted once a training has started, never before, and
//   only the member gives it: attended, or skipped with an optional reason.
// - Times are Vietnam time, where Edge8 works (kernel/config/dates).
import { z } from "zod";

export const SKIP_REASONS = ["clashed", "unwell", "needed_rest", "other"] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];
export const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  clashed: "Clashed",
  unwell: "Unwell",
  needed_rest: "Needed rest",
  other: "Other",
};

export type AttendanceStatus = "pending" | "attended" | "skipped" | "absent";

/**
 * Who set an attendance row (English Program PR 4, ADR 0016 amended for taught
 * sessions): the member's own word, the session's transcript, or the organiser.
 * A correction by the member or the organiser wins and is never overwritten by
 * a later transcript.
 */
export type AttendanceSource = "member" | "transcript" | "organiser";

// The review (TR.3): stars make it, the rest is optional. The keys are the
// database's (training_reviews check constraints); the labels are the page's.
export const LOADS = ["too_little", "about_right", "too_much"] as const;
export type Load = (typeof LOADS)[number];
export const LOAD_LABEL: Record<Load, string> = { too_little: "Too little", about_right: "About right", too_much: "Too much" };

export const FEELINGS = ["useful", "energising", "clear", "fun", "too_fast", "confusing", "boring", "hard"] as const;
export type Feeling = (typeof FEELINGS)[number];
export const FEELING_LABEL: Record<Feeling, string> = {
  useful: "Useful",
  energising: "Energising",
  clear: "Clear",
  fun: "Fun",
  too_fast: "Too fast",
  confusing: "Confusing",
  boring: "Boring",
  hard: "Hard",
};

/** A saved review, as the member's input leaves it once checked (ReviewInput below): one shape everywhere. */
export type MyReview = ReviewInputType;

/**
 * The member's word on a training, whether they went and how it landed, is
 * open for seven days from its end and final after (spec, decided 2026-10-12:
 * an unanswered training leaves the tray then too, so it never piles up). A
 * training the member logged themselves after it ended counts from the moment
 * they logged it instead, so logging last week's conference still leaves a week
 * to review it (Khoa, 2026-10-12).
 */
export const WORD_WINDOW_DAYS = 7;
const WINDOW_MS = WORD_WINDOW_DAYS * 24 * 60 * 60_000;

/** Where a training's seven days count from: its end, or, for one logged late by the member, when they logged it. */
export function windowStart(t: { endsAt: string; selfLogged: boolean; loggedAt: string }): string {
  return t.selfLogged && new Date(t.loggedAt).getTime() > new Date(t.endsAt).getTime() ? t.loggedAt : t.endsAt;
}

/** The moment a training's answer and review become final, from its window's start. */
export function finalAt(from: string): string {
  return new Date(new Date(from).getTime() + WINDOW_MS).toISOString();
}

/** Whether the member may still answer, review, change or remove, from its window's start. */
export function wordOpen(from: string, now: Date): boolean {
  return now.getTime() < new Date(from).getTime() + WINDOW_MS;
}

/** One training as the member sees it on My Training. */
export type MyTrainingRow = {
  attendanceId: string;
  trainingId: string;
  title: string;
  typeId: string;
  typeName: string;
  // The type's place in the list, which picks its colour on the page.
  typeRank: number;
  // Who put it on the member's record; null for one they logged themselves.
  organiserName: string | null;
  startsAt: string;
  endsAt: string;
  selfLogged: boolean;
  status: AttendanceStatus;
  // Who set the status; a transcript's word waits for the member's confirmation.
  source: AttendanceSource;
  skipReason: SkipReason | null;
  answeredAt: string | null;
  // The member's review, on an attended training only.
  review: MyReview | null;
  // When the training was put on the record (trainings.created_at): where a
  // late self-logged training's window starts.
  loggedAt: string;
};

export type OrganiserMay = { move: boolean; cancel: boolean; changeWho: boolean; editText: boolean };

export type TrainingState = "upcoming" | "started" | "cancelled";

/** Where a training stands: the one place that decides it, for the rules and the pages alike. */
export function trainingState(training: { startsAt: string; cancelledAt: string | null }, now: Date): TrainingState {
  if (training.cancelledAt) return "cancelled";
  return new Date(training.startsAt).getTime() > now.getTime() ? "upcoming" : "started";
}

export function organiserMay(training: { startsAt: string; cancelledAt: string | null }, now: Date): OrganiserMay {
  const state = trainingState(training, now);
  if (state === "cancelled") return { move: false, cancel: false, changeWho: false, editText: false };
  const before = state === "upcoming";
  return { move: before, cancel: before, changeWho: before, editText: true };
}

const ms = (iso: string) => new Date(iso).getTime();

/**
 * My Training's three lists. Waiting: started trainings whose window is open and
 * that still want the member's word, either whether they went or, having gone,
 * a review; oldest first so nothing slips. Coming up: not started. The log:
 * everything else, newest first, including a training whose window closed
 * with no answer.
 */
export function coolDown(rows: MyTrainingRow[], now: Date): { waiting: MyTrainingRow[]; comingUp: MyTrainingRow[]; log: MyTrainingRow[] } {
  const t = now.getTime();
  const started = (r: MyTrainingRow) => ms(r.startsAt) <= t;
  // A row the transcript set is wanted too: the member confirms or corrects it (PR 4).
  const wanted = (r: MyTrainingRow) => r.status === "pending" || r.source === "transcript" || (r.status === "attended" && r.review === null);
  const waits = (r: MyTrainingRow) => started(r) && wordOpen(windowStart(r), now) && wanted(r);
  return {
    waiting: rows.filter(waits).sort((a, b) => ms(a.startsAt) - ms(b.startsAt)),
    comingUp: rows.filter((r) => !started(r) && r.status === "pending").sort((a, b) => ms(a.startsAt) - ms(b.startsAt)),
    log: rows.filter((r) => started(r) && !waits(r)).sort((a, b) => ms(b.startsAt) - ms(a.startsAt)),
  };
}

/** What a log row says about the member's word: "4 stars · about right", "Went", "Skipped · unwell", "No answer". */
export function answerLine(r: Pick<MyTrainingRow, "status" | "skipReason" | "review">): string {
  if (r.status === "pending") return "No answer";
  if (r.status === "absent") return "Absent";
  if (r.status === "skipped") return r.skipReason ? `Skipped · ${SKIP_REASON_LABEL[r.skipReason].toLowerCase()}` : "Skipped";
  if (!r.review) return "Went";
  const stars = `${r.review.stars} ${r.review.stars === 1 ? "star" : "stars"}`;
  return r.review.load ? `${stars} · ${LOAD_LABEL[r.review.load].toLowerCase()}` : stars;
}

// Vietnam keeps +07:00 all year, so a fixed offset is exact.
const VN_OFFSET = "+07:00";

/** A date, a start time and a length in minutes, as the instants they mean in Vietnam. */
export function saigonRange(date: string, start: string, minutes: number): { startsAt: string; endsAt: string } {
  const from = new Date(`${date}T${start}:00${VN_OFFSET}`);
  return { startsAt: from.toISOString(), endsAt: new Date(from.getTime() + minutes * 60_000).toISOString() };
}

const Uuid = z.string().uuid("That was not found.");
const When = {
  typeId: Uuid,
  title: z.string().trim().min(1, "Give it a title.").max(200, "Keep the title under 200 characters."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a start time."),
  minutes: z.number().int().min(5, "A training lasts at least 5 minutes.").max(24 * 60, "A training lasts at most a day."),
  notes: z.string().trim().max(2000, "Keep the notes under 2,000 characters.").optional(),
};

/** A training a member logs for themselves. */
export const LogInput = z.object(When);
export type LogInputType = z.infer<typeof LogInput>;

/** A training an organiser puts on people's records. */
export const ScheduleInput = z.object({ ...When, personIds: z.array(Uuid).min(1, "Add at least one person.").max(200) });
export type ScheduleInputType = z.infer<typeof ScheduleInput>;

/** What may change on a training once scheduled: the title and notes always, the rest before it starts. */
export const UpdateInput = z.object({
  title: When.title,
  notes: When.notes,
  date: When.date.optional(),
  start: When.start.optional(),
  minutes: When.minutes.optional(),
  personIds: z.array(Uuid).min(1, "Keep at least one person.").max(200).optional(),
});
export type UpdateInputType = z.infer<typeof UpdateInput>;

/**
 * What a Raid's Host may change on the session they host (QS.5b): its time and
 * nothing else. Strict, so a title, notes or people sent with it are refused
 * rather than dropped without a word: the session's title is the fire's, and
 * its people seat themselves.
 */
export const MoveInput = z.object({ date: When.date, start: When.start, minutes: When.minutes }).strict();
export type MoveInputType = z.infer<typeof MoveInput>;

export const AnswerInput = z.discriminatedUnion("answer", [
  z.object({ answer: z.literal("attended") }),
  z.object({ answer: z.literal("skipped"), reason: z.enum(SKIP_REASONS).nullable() }),
]);
export type AnswerInputType = z.infer<typeof AnswerInput>;

/**
 * A review: the stars, and whatever else the member chose to say. Repeated tags
 * collapse; a blank note is none; and with no note there is nothing to sign, so
 * a box left ticked over a cleared note saves unsigned instead of failing (the
 * table refuses a signed review without a note).
 */
export const ReviewInput = z
  .object({
    stars: z.number().int("Pick one to five stars.").min(1, "Pick one to five stars.").max(5, "Pick one to five stars."),
    load: z.enum(LOADS).nullable(),
    tags: z.array(z.enum(FEELINGS)).max(FEELINGS.length * 2).transform((tags) => [...new Set(tags)]),
    note: z
      .string()
      .max(2000, "Keep the note under 2,000 characters.")
      .nullable()
      .transform((s) => (s && s.trim() ? s.trim() : null)),
    signed: z.boolean(),
  })
  .transform((v) => ({ ...v, signed: v.signed && v.note !== null }));
export type ReviewInputType = z.infer<typeof ReviewInput>;

export const TypeName = z.string().trim().min(1, "Name the type.").max(60, "Keep the name under 60 characters.");
