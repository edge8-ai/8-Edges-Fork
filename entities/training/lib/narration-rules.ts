// The weekly programme narration's rules (TR.9, spec stories 52 and 53): what
// the model is told about a slice, which numbers a story may cite, and the
// check every story passes before it is kept. Pure, so the one promise the
// narration makes (it invents no figure) is tested without a model.
//
// The model sees the figures the card shows and nothing else: counts, the star
// average, the load mix, the feelings and the reasons people missed. Never a
// name and never a note's words, so a story cannot quote or point at anyone.
import { createHash } from "node:crypto";
import { loadShares, notWentLine, starsLabel, wentShare } from "../ui/programme-format";
import { PERIOD_LABEL, type Figures, type Period } from "./programme-read-rules";

/** The longest story the table keeps. */
export const STORY_MAX = 800;

/** The figures as the card states them, one line each: the only facts the model is given. */
export function figureLines(f: Figures): string[] {
  const load = loadShares(f);
  const lines = [
    `Trainings: ${f.trainings}`,
    `People who reviewed: ${f.reviewers}`,
    `Reviews: ${f.reviews}`,
    `Average stars: ${starsLabel(f)} out of 5`,
  ];
  if (load.answered > 0) lines.push(`Load: too little ${load.little}%, about right ${load.right}%, too much ${load.much}%`);
  if (f.tags.length > 0) lines.push(`How it felt (times chosen): ${f.tags.map((t) => `${t.label} ${t.n}`).join(", ")}`);
  lines.push(`Went: ${f.went} of ${f.listed} (${wentShare(f)}%)`);
  if (f.listed > f.went) lines.push(`Did not go: ${notWentLine(f)}`);
  return lines;
}

/** The prompt's description of one slice. */
export function sliceInput(s: { grain: "type" | "plan"; name: string; sub: string }, period: Period, f: Figures): string {
  const what = s.grain === "type" ? `Training type: ${s.name}` : `Training plan: ${s.name}`;
  return [what, `Period: ${PERIOD_LABEL[period]}`, ...figureLines(f)].join("\n");
}

// A number as a story may write it: 12, 4.3, 73%. A thousands separator is
// read as part of the number, so "1,200" is 1200 and is checked as such.
const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

/** Every number written in a text, in the form the check compares. */
export function numbersIn(text: string): string[] {
  return (text.match(NUMBER) ?? []).map(normal);
}

/** The numbers a story about these figures may cite: exactly those in its input, the period it was told included. */
export function allowedNumbers(f: Figures, period: Period): Set<string> {
  // "out of 5" is in every input; 5 is allowed as the scale, not as a count.
  return new Set([...figureLines(f), PERIOD_LABEL[period]].flatMap((line) => numbersIn(line)));
}

function normal(n: string): string {
  const plain = n.replace(/,/g, "");
  return plain.includes(".") ? String(Number(plain)) : String(Number(plain));
}

// Numbers written out in words make a claim the digit check cannot see, so the
// prompt asks for digits and a story that spells one out is set aside.
const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|dozen|half|twice|double|triple|quarter)\b/i;

/** Why a text may not be kept: a number spelled out, or one that is not among those allowed. Null when every number checks. */
export function numberProblem(body: string, allowed: ReadonlySet<string>): string | null {
  const word = body.match(NUMBER_WORDS);
  if (word) return `The story writes "${word[0]}" in words, which the figures cannot check.`;
  for (const m of body.match(NUMBER) ?? []) {
    if (!allowed.has(normal(m))) return `The story cites ${m}, which is not in its figures.`;
  }
  return null;
}

export type StoryCheck = { ok: true; body: string } | { ok: false; error: string };

/**
 * Keeps a story only when every number in it is one of its figures (story 53).
 * A story that names another number, spells a number out, or is empty or too
 * long is refused with the reason, and the slice shows figures only that week.
 */
export function checkStory(raw: string, f: Figures, period: Period): StoryCheck {
  const body = raw.trim().replace(/\s+/g, " ");
  if (body === "") return { ok: false, error: "The story came back empty." };
  if (body.length > STORY_MAX) return { ok: false, error: `The story ran past ${STORY_MAX} characters.` };
  const problem = numberProblem(body, allowedNumbers(f, period));
  return problem ? { ok: false, error: problem } : { ok: true, body };
}

/** A stable hash of the figures, so two viewers who see the same slice share one story. */
export function figuresHash(f: Figures, s: { grain: string; name: string }, period: Period): string {
  const canonical = JSON.stringify({ grain: s.grain, name: s.name, period, lines: figureLines(f) });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Monday 2 Nov" (or "Mon 2 Nov"): the week a story was written for, from its Monday. */
export function storyWeekLabel(week: string, short = false): string {
  return `${short ? "Mon" : "Monday"} ${Number(week.slice(8, 10))} ${MONTHS[Number(week.slice(5, 7)) - 1]}`;
}

/**
 * The stories a reader may see beside the slices on their page: a slice's
 * story only while its figures are exactly the ones it was written from. A
 * Monday story kept beside Thursday's figures would let a reader subtract the
 * two ("12 people at 4.3" against "13 at 4.4") and read one person's rating,
 * the inference the three-reviewer rule exists to stop (boundary review on
 * TR.9). So once a slice's figures move, it shows figures only until Monday.
 */
export function storiesMatching<S extends { body: string; week: string; hash: string }>(
  slices: readonly ({ key: string; grain: "type" | "plan"; name: string } & ({ shown: true; figures: Figures } | { shown: false }))[],
  period: Period,
  stories: ReadonlyMap<string, S>,
): Map<string, { body: string; week: string }> {
  const out = new Map<string, { body: string; week: string }>();
  for (const s of slices) {
    const story = stories.get(s.key);
    if (s.shown && story && story.hash === figuresHash(s.figures, s, period)) out.set(s.key, { body: story.body, week: story.week });
  }
  return out;
}

/** The pieces of a story for the page: its numbers set apart, so a card can show them bold. */
export function storyParts(body: string): { text: string; number: boolean }[] {
  const parts: { text: string; number: boolean }[] = [];
  let at = 0;
  for (const m of body.matchAll(/\d[\d,]*(?:\.\d+)?%?/g)) {
    const i = m.index ?? 0;
    if (i > at) parts.push({ text: body.slice(at, i), number: false });
    parts.push({ text: m[0], number: true });
    at = i + m[0].length;
  }
  if (at < body.length) parts.push({ text: body.slice(at), number: false });
  return parts;
}
