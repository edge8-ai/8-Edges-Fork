// The pure side of a lesson's English evaluation (ADR 0016, amended
// 2026-10-26), free of any server import so the panels and the tests can share
// it: the stored shape, the check that every quoted example is really in the
// transcript, and who spoke. The evaluation is read by the lesson's teacher
// and by admins, never by the learner.
import { z } from "zod";
import { matchRoster, turnsIn, type RosterPerson } from "./transcript-attendance";

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

export const MAX_STRENGTHS = 4;
export const MAX_IMPROVEMENTS = 4;
export const MAX_EXAMPLES = 5;

/** The longest feedback a teacher may write on one learner for one lesson, the row this evaluation sits on. */
export const FEEDBACK_MAX = 4000;

const Line = z.string().trim().min(1).max(600);

/** One learner's evaluation as training_learner_feedback.evaluation stores it. */
export const Evaluation = z.object({
  level: z.object({ label: z.enum(CEFR_LEVELS), reason: z.string().trim().min(1).max(400) }),
  summary: z.string().trim().min(1).max(1500),
  strengths: z.array(Line).max(MAX_STRENGTHS),
  improvements: z.array(Line).max(MAX_IMPROVEMENTS),
  examples: z.array(z.object({ said: Line, better: Line })).max(MAX_EXAMPLES),
});
export type EvaluationType = z.infer<typeof Evaluation>;

/** The stored evaluation, or null when there is none or it is not the shape the code knows. */
export function readEvaluation(raw: unknown): EvaluationType | null {
  const p = Evaluation.safeParse(raw);
  return p.success ? p.data : null;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Whether the words were said in the transcript, whitespace aside. */
export function quotedIn(said: string, transcript: string): boolean {
  const s = squash(said);
  return s.length > 0 && squash(transcript).includes(s);
}

/**
 * Pure: an evaluation as the model gave it, made safe to store. An example
 * whose words are not in the transcript is dropped, never kept as a quote; the
 * lists are cut to their limits; then the shape is checked. Null when what is
 * left is not an evaluation.
 */
export function settleEvaluation(raw: { level: string; level_reason: string; summary: string; strengths: string[]; improvements: string[]; examples: { said: string; better: string }[] }, transcript: string): EvaluationType | null {
  const parsed = Evaluation.safeParse({
    level: { label: raw.level.trim().toUpperCase(), reason: raw.level_reason },
    summary: raw.summary,
    strengths: raw.strengths.slice(0, MAX_STRENGTHS),
    improvements: raw.improvements.slice(0, MAX_IMPROVEMENTS),
    examples: raw.examples.filter((e) => quotedIn(e.said, transcript)).slice(0, MAX_EXAMPLES),
  });
  return parsed.success ? parsed.data : null;
}

/**
 * Pure: which of these people spoke in the transcript. Only a turn counts (a
 * "Name: text" line or a Lark turn block); a name on a participants header does
 * not, so a learner who sat silent is not evaluated. Matched as attendance is,
 * by any name the person goes by, diacritics folded.
 */
export function whoSpoke(transcript: string, people: readonly RosterPerson[]): Set<string> {
  const speakers = [...new Set(turnsIn(transcript).map((t) => t.speaker))];
  const heard = matchRoster(speakers, people);
  return new Set(people.filter((p) => heard.get(p.id) === "attended").map((p) => p.id));
}
