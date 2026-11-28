import { goalDirection, measureOf } from "./goal-measure";
import { whenLabel } from "./help-words";
import { NO_GOAL_NOTE } from "./help-lines";

// A FAST goal in a line: its own number and when it last moved. Split out of
// help-lines.ts (K.82) when the home card needed the number without the title.

export type RosterGoalFacts = {
  title: string;
  startValue?: number | null; // absent reads as going up, the default (K.78)
  currentValue: number | null;
  targetValue: number | null;
  metricUnit: string | null;
  updatedAt: string | null;
};

// "119 of 200 students · updated Monday", or the invitation when there is no
// goal at all. The number is the goal's, never the person's.
export function goalLine(goal: RosterGoalFacts | null, todayISO: string): string {
  if (!goal) return NO_GOAL_NOTE;
  const meta = goalMeta(goal, todayISO);
  return meta ? `${goal.title} — ${meta}` : goal.title;
}

// "119 of 200 students · updated Monday": the goal's own number and when it
// last moved, without its title — the home card sets the title on its own line
// above a bar (K.82).
export function goalMeta(goal: RosterGoalFacts, todayISO: string): string {
  const direction = goalDirection(goal.startValue ?? null, goal.targetValue);
  const measure = measureOf({ current: goal.currentValue, target: goal.targetValue, unit: goal.metricUnit, direction });
  const parts: string[] = measure ? [measure] : [];
  if (goal.updatedAt) parts.push(`updated ${whenLabel(goal.updatedAt.slice(0, 10), todayISO)}`);
  return parts.join(" · ");
}
