// The pure side of a session recap (English Program PR 7), free of any server
// import so the panel and the tests can share it: the stored shape, and the
// validator that refuses a recap naming a learner who was not there or a
// figure the inputs never gave it.
import { z } from "zod";

const Md = z.string().trim().min(1).max(8000);

/** The recap as trainings.recap stores it. */
export const Recap = z.object({
  covered: Md,
  learners: z.array(z.object({ person_id: z.string().uuid(), md: Md })).refine((l) => new Set(l.map((x) => x.person_id)).size === l.length, "One line per learner."),
  homework_suggestion: z.string().trim().max(2000),
});
export type RecapType = z.infer<typeof Recap>;

export const RECAP_STATES = ["none", "drafted", "published"] as const;
export type RecapState = (typeof RECAP_STATES)[number];

/** The numbers a text mentions, as strings, so a recap can be checked against what it was given. */
export function figuresIn(text: string): Set<string> {
  return new Set((text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", ".")));
}

/**
 * Pure: a recap is acceptable when every learner line is for a learner who
 * attended, and every figure in it appears in the transcript or the plan. The
 * first problem is the reason, so the organiser sees why a draft did not land.
 */
export function validateRecap(recap: RecapType, input: { attendedIds: readonly string[]; sources: readonly string[] }): { ok: true } | { ok: false; error: string } {
  const attended = new Set(input.attendedIds);
  for (const l of recap.learners) if (!attended.has(l.person_id)) return { ok: false, error: `The recap addressed a learner who was not in the session (${l.person_id}).` };
  const given = new Set(input.sources.flatMap((s) => [...figuresIn(s)]));
  const said = [recap.covered, ...recap.learners.map((l) => l.md), recap.homework_suggestion].flatMap((t) => [...figuresIn(t)]);
  const invented = said.find((n) => !given.has(n));
  if (invented !== undefined) return { ok: false, error: `The recap cites a figure that is not in the transcript or the plan (${invented}).` };
  return { ok: true };
}

/** How a recap's state reads in a list. */
export const RECAP_LABEL: Record<RecapState, string> = { none: "No recap", drafted: "Recap drafted", published: "Recap published" };
