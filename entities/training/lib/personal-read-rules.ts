// The personal read's rules (TR.10, spec stories 31 to 34 and ADR 0016): when
// it wakes, what the model is told, and the check every read passes before the
// page shows it. Pure, so the two promises it makes (it stays quiet below five
// reviews, and it cites no number it was not given) are tested without a model.
//
// The model sees the member's own record and nothing about anyone else: no
// organiser's name, no teacher's note and no outcome still waiting for the
// member's word, because a suggestion counts for nothing until they add it.
import { businessDate } from "@/kernel/config/dates";
import { numberProblem, numbersIn } from "./narration-rules";
import type { Outcome } from "./outcomes";
import { minutesOf, mondayOf } from "./training-block";
import { FEELING_LABEL, LOAD_LABEL, SKIP_REASON_LABEL, type MyTrainingRow } from "./training-rules";

/** The read says nothing until this many reviews: two data points are not a pattern (story 33). */
export const READ_WAKES_AT = 5;

const WINDOW_DAYS = 365;
const DAY_MS = 86_400_000;

/** The moment the read's window opens, for the work signals' reads. */
export function readSince(now: Date): string {
  return new Date(now.getTime() - WINDOW_DAYS * DAY_MS).toISOString();
}

/** The trainings the read covers: started, inside the last twelve months, oldest first. */
function inWindow(rows: readonly MyTrainingRow[], now: Date): MyTrainingRow[] {
  const since = readSince(now);
  const until = now.toISOString();
  return rows.filter((r) => new Date(r.startsAt).toISOString() >= since && new Date(r.startsAt).toISOString() <= until).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** How many reviews the read would have to go on. */
export function reviewsSoFar(rows: readonly MyTrainingRow[], now: Date): number {
  return inWindow(rows, now).filter((r) => r.review).length;
}

/**
 * Which state the card is in. Below five reviews it is quiet even when the
 * address asks for the read, so a kept link spends no model call on a member
 * it has nothing true to say to.
 */
export function readState(reviews: number, asked: boolean): "quiet" | "sealed" | "open" {
  if (reviews < READ_WAKES_AT) return "quiet";
  return asked ? "open" : "sealed";
}

export type ReadInputs = {
  rows: readonly MyTrainingRow[];
  outcomes: readonly Outcome[];
  plans: readonly { id: string; title: string }[];
  // When each card was finished and each pull request merged; null where the
  // deployment has no such signal, which is not the same as none.
  finishedCards: readonly string[] | null;
  mergedPullRequests: readonly string[] | null;
  now: Date;
};

const oneDecimal = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const average = (ns: readonly number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;

function statusWord(r: MyTrainingRow): string {
  if (r.status === "attended") return "went";
  if (r.status === "skipped") return r.skipReason ? `skipped (${SKIP_REASON_LABEL[r.skipReason]})` : "skipped";
  if (r.status === "absent") return "did not go";
  return "no answer";
}

function trainingLine(r: MyTrainingRow): string {
  const parts = [businessDate(r.startsAt), r.typeName, `"${r.title}"`, `${minutesOf(r)} min`, statusWord(r)];
  if (r.review) {
    parts.push(`${r.review.stars} stars`);
    if (r.review.load) parts.push(`load ${LOAD_LABEL[r.review.load].toLowerCase()}`);
    if (r.review.tags.length > 0) parts.push(`felt ${r.review.tags.map((t) => FEELING_LABEL[t]).join(", ")}`);
    if (r.review.note) parts.push(`note: "${r.review.note}"`);
  }
  return `- ${parts.join(" · ")}`;
}

function typeLine(name: string, rows: readonly MyTrainingRow[]): string {
  const reviews = rows.flatMap((r) => (r.review ? [r.review.stars] : []));
  const went = rows.filter((r) => r.status === "attended").length;
  const stars = reviews.length > 0 ? `, average ${oneDecimal(average(reviews))} stars` : "";
  return `- ${name}: ${rows.length} trainings, went ${went}, ${reviews.length} reviews${stars}`;
}

/** What the member achieved, in their own words, with what they credited for it. */
function outcomeLine(o: Outcome, rows: readonly MyTrainingRow[], plans: ReadInputs["plans"]): string {
  const credited = o.credits.flatMap((c) => {
    const title = c.kind === "training" ? rows.find((r) => r.trainingId === c.id)?.title : plans.find((p) => p.id === c.id)?.title;
    return title ? [`"${title}"`] : [];
  });
  return `- ${o.happenedOn}: "${o.description}"${credited.length > 0 ? ` (credited: ${credited.join(", ")})` : ""}`;
}

/** One line per week anything happened: the training beside the work, so the model can set one against the other. */
function weekLines(rows: readonly MyTrainingRow[], inputs: ReadInputs): string[] {
  const minutes = new Map<string, number>();
  const cards = new Map<string, number>();
  const prs = new Map<string, number>();
  const bump = (m: Map<string, number>, at: string, by = 1) => {
    const week = mondayOf(businessDate(at));
    m.set(week, (m.get(week) ?? 0) + by);
  };
  for (const r of rows) if (r.status === "attended") bump(minutes, r.startsAt, minutesOf(r));
  for (const at of inputs.finishedCards ?? []) bump(cards, at);
  for (const at of inputs.mergedPullRequests ?? []) bump(prs, at);
  const weeks = [...new Set([...minutes.keys(), ...cards.keys(), ...prs.keys()])].sort();
  return weeks.map((week) => {
    const parts = [`${minutes.get(week) ?? 0} min trained`];
    if (inputs.finishedCards) parts.push(`${cards.get(week) ?? 0} cards finished`);
    if (inputs.mergedPullRequests) parts.push(`${prs.get(week) ?? 0} pull requests merged`);
    return `- ${week}: ${parts.join(", ")}`;
  });
}

/** The prompt's description of the member's record: the only facts the model is given. */
export function readInput(inputs: ReadInputs): string {
  const rows = inWindow(inputs.rows, inputs.now);
  const stars = rows.flatMap((r) => (r.review ? [r.review.stars] : []));
  const byType = new Map<string, MyTrainingRow[]>();
  for (const r of rows) byType.set(r.typeName, [...(byType.get(r.typeName) ?? []), r]);
  const went = rows.filter((r) => r.status === "attended").length;
  const sections = [
    `Trainings: ${rows.length}, went ${went}\nReviews: ${stars.length}\nAverage stars: ${stars.length > 0 ? oneDecimal(average(stars)) : "none"} out of 5`,
    `By type:\n${[...byType].map(([name, list]) => typeLine(name, list)).join("\n")}`,
    `Each training:\n${rows.map(trainingLine).join("\n")}`,
  ];
  if (inputs.outcomes.length > 0) sections.push(`What they achieved, in their own words:\n${inputs.outcomes.map((o) => outcomeLine(o, inputs.rows, inputs.plans)).join("\n")}`);
  const weeks = weekLines(rows, inputs);
  if (weeks.length > 0) sections.push(`Week by week (the date is the week's Monday):\n${weeks.join("\n")}`);
  return sections.join("\n\n");
}

const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Read from 7 reviews, 9 trainings and 2 outcomes, 31 finished cards and 14 pull requests, over the last 12 months." */
export function readUsedLine(inputs: ReadInputs): string {
  const rows = inWindow(inputs.rows, inputs.now);
  const since = readSince(inputs.now);
  const signal = (dates: readonly string[] | null, one: string, many: string) => (dates ? [counted(dates.filter((d) => d >= since).length, one, many)] : []);
  const work = [...signal(inputs.finishedCards, "finished card", "finished cards"), ...signal(inputs.mergedPullRequests, "pull request", "pull requests")];
  const record = `${counted(rows.filter((r) => r.review).length, "review", "reviews")}, ${counted(rows.length, "training", "trainings")} and ${counted(inputs.outcomes.length, "outcome", "outcomes")}`;
  return `Read from ${record}${work.length > 0 ? `, ${work.join(" and ")}` : ""}, over the last 12 months.`;
}

export type ReadDraft = { headline: string; noticed: string[]; worthTrying: string | null };
export type ReadCheck = { ok: true; read: ReadDraft } | { ok: false; error: string };

const tidy = (s: string) => s.trim().replace(/\s+/g, " ");

const HEADLINE_MAX = 160;
const NOTICED_MAX = 320;
const NOTICED_MOST = 3;
const TRYING_MAX = 200;

// A date is how the record is laid out, not a figure a read may cite, and its
// digits would otherwise let "10" and "5" through as if they had been given.
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;

/** Keeps a read only when it fits the card and every number in it was in its input. */
export function checkRead(draft: ReadDraft, input: string): ReadCheck {
  const headline = tidy(draft.headline);
  const noticed = draft.noticed.map(tidy).filter((n) => n !== "");
  const worthTrying = draft.worthTrying ? tidy(draft.worthTrying) || null : null;
  if (headline === "" || headline.length > HEADLINE_MAX) return { ok: false, error: "The headline is empty or too long." };
  if (noticed.length === 0 || noticed.length > NOTICED_MOST || noticed.some((n) => n.length > NOTICED_MAX)) return { ok: false, error: "The read must notice one to three things, each short." };
  if (worthTrying && worthTrying.length > TRYING_MAX) return { ok: false, error: "The suggestion is too long." };
  const allowed = new Set(numbersIn(input.replace(ISO_DATE, " ")));
  const problem = numberProblem([headline, ...noticed, worthTrying ?? ""].join(" "), allowed);
  return problem ? { ok: false, error: problem } : { ok: true, read: { headline, noticed, worthTrying } };
}
