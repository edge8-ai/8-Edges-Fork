import type { LadderRung } from "./data/member-ladder";
import type { CoachingGoal } from "./types";

// The goal chain (K.25): the member's previous quarters' goals, drawn as
// earlier steps on the same path as the active goal's ladder. It is history,
// not a record — each step carries only the quarter it belonged to and how it
// ended, and nothing here counts, ranks or scores the person.

// How a past goal ended. "carried" is the goal that never closed and came with
// the member into a later quarter, which is a different fact from dropping it.
export type ChainEndState = "achieved" | "dropped" | "carried";

const CHAIN_END_STATE_LABELS: Record<ChainEndState, string> = {
  achieved: "achieved",
  dropped: "dropped",
  carried: "carried",
};

export type ChainStep = {
  id: string;
  title: string;
  quarterLabel: string | null;
  endState: ChainEndState;
};

// Only the fields the chain reads, so the builder stays testable without a
// whole CoachingGoal.
export type ChainGoal = Pick<CoachingGoal, "id" | "title" | "status" | "quarterLabel">;

function sameGoal(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// The end state of one past goal, or null when it is not history at all — a
// draft for the current or a future quarter is something the member is still
// writing, not a step behind them.
function endStateOf(goal: ChainGoal, active: ChainGoal | null): ChainEndState | null {
  if (goal.status === "achieved") return "achieved";
  if (goal.status === "dropped") return "dropped";
  // What is left is a goal that never closed: it counts as carried when it
  // belonged to an earlier quarter than the active one, or when it is the same
  // goal by title, which is how a member continues one across a quarter line.
  if (!active) return null;
  if (sameGoal(goal.title, active.title)) return "carried";
  const from = goal.quarterLabel;
  const to = active.quarterLabel;
  if (from && to && from < to) return "carried";
  return null;
}

// The chain, oldest first. Quarter labels are "2026-Q3", so a plain string
// comparison orders them; a goal with no quarter label has nothing to place it
// by and sorts after the labelled ones, with the title breaking ties so the
// order is stable between renders.
export function buildGoalChain(goals: ChainGoal[], active: ChainGoal | null): ChainStep[] {
  const steps: ChainStep[] = [];
  for (const goal of goals) {
    if (active && goal.id === active.id) continue;
    const endState = endStateOf(goal, active);
    if (!endState) continue;
    steps.push({ id: goal.id, title: goal.title, quarterLabel: goal.quarterLabel, endState });
  }
  return steps.sort((a, b) => {
    if (a.quarterLabel !== b.quarterLabel) {
      if (!a.quarterLabel) return 1;
      if (!b.quarterLabel) return -1;
      return a.quarterLabel < b.quarterLabel ? -1 : 1;
    }
    return a.title.localeCompare(b.title);
  });
}

// The chain as rungs the ascent can draw: muted steps with no number, no bar
// and no paragraph to open, whose eyebrow says which quarter it was and how it
// ended.
export function chainRungs(steps: ChainStep[]): LadderRung[] {
  return steps.map((step) => ({
    kind: "past" as const,
    label: step.title,
    eyebrow: `${step.quarterLabel ?? "Earlier"} · ${CHAIN_END_STATE_LABELS[step.endState]}`,
    detail: null,
    progressPct: null,
    measure: null,
    currentValue: null,
    targetValue: null,
    unit: null,
    goalId: null,
  }));
}
