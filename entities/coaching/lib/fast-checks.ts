// The four FAST checks, as pure functions.
//
// They live outside the form component on purpose: the rule "this goal has
// earned its S" is product logic worth a test, and a React component cannot be
// asserted on without a renderer. The form imports these and renders the
// result; nothing here touches React, Supabase or the clock beyond the date
// string it is handed.

import { saigonToday } from "@/kernel/config/dates";
import type { LadderInput } from "./types";

// The four boxes the member fills in. They are joined into `goals.title` on
// save and never stored apart: a goal is one sentence, and a schema for its
// grammar would be four columns nobody reads.
export type GoalSentenceParts = {
  verb: string;
  what: string;
  // "how much, or to whom" — the box that carries the number or the audience.
  amount: string;
  byWhen: string;
};

export const EMPTY_PARTS: GoalSentenceParts = { verb: "", what: "", amount: "", byWhen: "" };

// "Cut days to hire to under 20 days by 30 September". Blank boxes simply drop
// out, so the preview reads as a sentence from the first keystroke.
export function sentenceOf(parts: GoalSentenceParts): string {
  return [parts.verb, parts.what, parts.amount, parts.byWhen]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" ");
}

// A saved goal comes back as one sentence, so an edit starts with the whole
// sentence in the first box rather than a guess at where the seams were.
// Re-splitting on whitespace would scramble the member's own words.
export function partsOf(title: string): GoalSentenceParts {
  return { ...EMPTY_PARTS, verb: title };
}

// "2026-Q3" from a YYYY-MM-DD date. The cycle label is derived everywhere it is
// needed rather than typed or hardcoded: a hardcoded "2026-Q3" in the coach's
// card and the directory editor is how goals ended up filed under a quarter
// that had already ended (K.13, spec §10).
export function quarterLabelFor(iso: string): string {
  const year = iso.slice(0, 4);
  const month = Number(iso.slice(5, 7));
  return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
}

export function currentQuarterLabel(): string {
  return quarterLabelFor(saigonToday());
}

export type FastKey = "F" | "A" | "S" | "T";

export type FastCheck = {
  key: FastKey;
  label: string;
  lit: boolean;
  note: string;
};

export type FastCheckInput = {
  sentence: string;
  stretchMarkdown: string | null;
  metricUnit: string | null;
  targetValue: number | null;
  dueDate: string | null;
  ladder: LadderInput;
};

// "… by 30 September", "… by Friday" — a deadline written into the sentence
// itself counts for Specific even when the date field is blank, because the
// member has said when. A trailing bare "by" does not.
function sentenceNamesADeadline(sentence: string): boolean {
  return /\bby\s+\S/i.test(sentence);
}

export function fastChecks(input: FastCheckInput): FastCheck[] {
  return [
    {
      key: "F",
      label: "Frequently discussed",
      // Earned by the product, not by the member: the prep generator puts the
      // goal in the first bullet of every 1-1, so F is true the moment a goal
      // exists. Showing it lit is honest, and it tells the member what the
      // page will do with what they type.
      lit: true,
      note: "Always on. Your goal is the first bullet of every 1-1 prep.",
    },
    {
      key: "A",
      label: "Ambitious",
      lit: Boolean(input.stretchMarkdown?.trim()),
      note: "Lights up when you write what doubling this goal would look like.",
    },
    {
      key: "S",
      label: "Specific",
      lit:
        Boolean(input.metricUnit?.trim()) &&
        input.targetValue !== null &&
        (Boolean(input.dueDate) || sentenceNamesADeadline(input.sentence)),
      note: "Lights up with a unit, a target and a date, in the sentence or the field.",
    },
    {
      key: "T",
      label: "Transparent",
      lit: input.ladder.kind !== "none",
      note: "Lights up when the goal ladders to a company key result everyone can see.",
    },
  ];
}

export function darkCount(checks: FastCheck[]): number {
  return checks.filter((c) => !c.lit).length;
}

// The line under the save button when checks are still dark. Saving is allowed
// on purpose (cooperation, not enforcement — spec §1): the form says what is
// missing and hands it to the 1-1 rather than refusing the goal.
export function darkNotice(checks: FastCheck[]): string | null {
  const dark = darkCount(checks);
  if (dark === 0) return null;
  return `${dark} check${dark === 1 ? "" : "s"} still dark; talk about it at your next 1-1.`;
}

// The toggle beside the sentence builder: a weak goal struck through, the same
// intent written so it can be checked. Data, not prose, so the form renders it
// with the strike-through as markup rather than as typed characters.
export const GOAL_EXAMPLES: { weak: string; good: string }[] = [
  { weak: "Improve hiring", good: "Cut days to hire from 34 to under 20 by 30 September" },
  { weak: "Be more visible in the market", good: "Publish 8 client case studies by the end of Q3" },
  { weak: "Get better at delegation", good: "Hand 3 recurring reports to the team by 31 August" },
];
