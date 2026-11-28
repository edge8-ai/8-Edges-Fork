// "How I work" — the member's own half of the OCEAN card (L.3).
//
// Four short prompts, in code rather than a table because nobody edits them per
// company and a table would buy an admin screen nobody asked for — the same
// reasoning as the questions library (K.24).
//
// The prompts are the whole design. Each one asks for something a colleague
// could ACT on, not something that describes the person: "what it means when I
// go quiet" tells a coach what to do, where "I am an introvert" only tells them
// what to think. Nothing here is a trait, a score or a category, which is what
// keeps this the member's own account rather than a second OCEAN read written
// by the person being read.

export type HowIWorkField = "bestHours" | "feedback" | "quiet" | "curious";

export type HowIWorkPrompt = {
  key: HowIWorkField;
  /** The column behind it. */
  column: "how_best_hours_md" | "how_feedback_md" | "how_quiet_md" | "how_curious_md";
  label: string;
  placeholder: string;
};

export const HOW_I_WORK: HowIWorkPrompt[] = [
  {
    key: "bestHours",
    column: "how_best_hours_md",
    label: "My best hours",
    placeholder: "Early. Anything hard before 11, meetings after.",
  },
  {
    key: "feedback",
    column: "how_feedback_md",
    label: "Feedback I can use",
    placeholder: "Direct and on the day. A week later I have lost the context.",
  },
  {
    key: "quiet",
    column: "how_quiet_md",
    label: "When I go quiet",
    placeholder: "I am stuck and re-reading it. Ask — I will not mind.",
  },
  {
    key: "curious",
    column: "how_curious_md",
    label: "What I am curious about",
    placeholder: "Anything that touches how we price work.",
  },
];

export type HowIWork = Record<HowIWorkField, string | null>;

/** The row's four columns as the page's four fields. */
export function toHowIWork(r: Record<string, unknown>): HowIWork {
  return {
    bestHours: (r.how_best_hours_md as string | null) ?? null,
    feedback: (r.how_feedback_md as string | null) ?? null,
    quiet: (r.how_quiet_md as string | null) ?? null,
    curious: (r.how_curious_md as string | null) ?? null,
  };
}

/** Whether the member has written any of it, for deciding what the coach sees. */
export function hasHowIWork(h: HowIWork): boolean {
  return HOW_I_WORK.some((p) => Boolean(h[p.key]?.trim()));
}

// Long enough for a couple of sentences. This is a manual, not an essay: a
// member with more to say has something for the agenda.
export const HOW_FIELD_MAX = 400;

/** What to store for one field, or null when they cleared it. */
export function normaliseHowField(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  return text ? text.slice(0, HOW_FIELD_MAX) : null;
}
