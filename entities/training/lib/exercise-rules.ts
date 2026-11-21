// The exercise library's rules (English Program PR 2), free of any server
// import so the "use client" library page can share them: the two sides, the
// input schema every form and import row passes, the view shape, and the
// filters as pure functions.
import { z } from "zod/v4";

export const SIDES = ["presentation", "reactive"] as const;
export type Side = (typeof SIDES)[number];
export const SIDE_LABEL: Record<Side, string> = {
  presentation: "Presentation",
  reactive: "Reactive",
};

const Tag = z.string().trim().min(1).max(40);

/** An exercise as the form and the import confirm hand it in. */
export const ExerciseInput = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Give it a title.")
      .max(200, "Keep the title under 200 characters."),
    side: z.enum(SIDES),
    skills: z
      .array(Tag)
      .refine((s) => s.length <= 12, "At most twelve skills.")
      .transform((s) => [...new Set(s.map((t) => t.toLowerCase()))]),
    format: z
      .string()
      .trim()
      .max(40, "Keep the format under 40 characters.")
      .transform((s) => s || null),
    minutesMin: z
      .number()
      .int()
      .min(1, "At least one minute.")
      .max(24 * 60),
    minutesMax: z
      .number()
      .int()
      .min(1)
      .max(24 * 60),
    instructions: z
      .string()
      .trim()
      .max(5000, "Keep the instructions under 5,000 characters.")
      .transform((s) => s || null),
    materialsUrl: z
      .string()
      .trim()
      .max(500)
      .transform((s) => s || null),
    homeworkAble: z.boolean(),
    planId: z.string().uuid().nullable(),
  })
  .refine((e) => e.minutesMax >= e.minutesMin, {
    message: "The longest time must be at least the shortest.",
    path: ["minutesMax"],
  });
export type ExerciseInputType = z.infer<typeof ExerciseInput>;

export const ConfirmDraftsInput = z.object({
  drafts: z
    .array(ExerciseInput)
    .min(1, "Tick at least one row.")
    .refine((d) => d.length <= 200, "At most two hundred rows at once."),
});

export type Exercise = {
  id: string;
  title: string;
  side: Side;
  skills: string[];
  format: string | null;
  minutesMin: number;
  minutesMax: number;
  instructions: string | null;
  materialsUrl: string | null;
  homeworkAble: boolean;
  planId: string | null;
  archived: boolean;
};

export type ExerciseFilters = {
  side?: Side | "";
  skill?: string;
  format?: string;
  q?: string;
};

/** Pure: which exercises match the page's filters. A blank filter matches all. */
export function filterExercises(
  rows: Exercise[],
  f: ExerciseFilters,
): Exercise[] {
  const q = f.q?.trim().toLowerCase() ?? "";
  return rows.filter(
    (e) =>
      (!f.side || e.side === f.side) &&
      (!f.skill || e.skills.includes(f.skill.toLowerCase())) &&
      (!f.format ||
        (e.format ?? "").toLowerCase() === f.format.toLowerCase()) &&
      (!q ||
        e.title.toLowerCase().includes(q) ||
        (e.instructions ?? "").toLowerCase().includes(q) ||
        e.skills.some((s) => s.includes(q))),
  );
}

/** Pure: the skills and formats the library uses, for the filter menus. */
export function facets(rows: Exercise[]): {
  skills: string[];
  formats: string[];
} {
  return {
    skills: [...new Set(rows.flatMap((e) => e.skills))].sort(),
    formats: [
      ...new Set(rows.flatMap((e) => (e.format ? [e.format] : []))),
    ].sort(),
  };
}

export type ExerciseDraft = ExerciseInputType & { keep: boolean };
