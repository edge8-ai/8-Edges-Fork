import { goalDirection, measureOf } from "@/entities/coaching/lib/goal-measure";
import type { CoachingGoal } from "@/entities/coaching/lib/types";

// The summary strip's goal cell, as facts rather than as an expression inside
// the view: the active goal's title, its measure as one readable phrase, and
// the day it is due. It moved out of MyCoachingView when that file reached its
// size cap, and it belongs here anyway — the strip draws a goal, it does not
// decide how a goal reads.

export type StripGoalFacts = {
  title: string;
  // "119 of 200 students" ("3 hours, down to 2" for a cut), or null while the
  // goal carries no numbers.
  measure: string | null;
  dueDate: string | null;
};

export function stripGoal(goals: CoachingGoal[]): StripGoalFacts | null {
  const active = goals.find((g) => g.status === "active") ?? null;
  if (!active) return null;
  return {
    title: active.title,
    measure: measureOf({
      current: active.currentValue,
      target: active.targetValue,
      unit: active.metricUnit,
      direction: goalDirection(active.startValue, active.targetValue),
    }),
    dueDate: active.dueDate,
  };
}
