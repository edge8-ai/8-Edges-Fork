import { selectKeyResults, selectObjectives } from "@/entities/org";
import { getGoalBumpsThisQuarter } from "./goal-bumps";
import { getKeyResultMove } from "./key-result-moves";
import { NOT_MEASURED_YET, getNeverMeasuredKeyResults } from "./key-result-measured";
import { goalDirection, measureOf, type GoalDirection } from "../goal-measure";
// The bar's share-of-the-way maths moved to its own browser-safe module in
// K.42, because the client recomputes it after a bump and must not pull this
// server-only file in to do so.
import { goalProgressPct } from "../goal-percent";
import type { CoachingGoal, EdgesLadder } from "../types";

// "Where I am going" (K.16, spec 2.1): the member's active goal seen as a
// ladder — company objective, key result, my goal, next rung. One rung per
// level, each with the one paragraph that opens behind it.
//
// The Eight Edges tree is another entity's, so it is read through the org
// door (selectObjectives / selectKeyResults), never by naming its tables.

export type LadderRung = {
  // "past" is a goal from an earlier quarter (K.25); it carries its own
  // eyebrow because the quarter and how the goal ended are per-rung facts.
  kind: "objective" | "key_result" | "goal" | "next" | "past";
  label: string;
  // The line above the label, when the rung's kind does not decide it. Null on
  // every rung whose eyebrow is fixed by its kind.
  eyebrow?: string | null;
  // The paragraph the rung opens to. Null when there is nothing to say, in
  // which case the rung does not expand.
  detail: string | null;
  // The goal rung's progress bar, 0-100, and the line under it. Null on every
  // other rung and on a goal with no measure typed.
  progressPct: number | null;
  measure: string | null;
  // The goal's current value and unit, for the one display-size number on the
  // Overview (K.29). Null on every other rung and on a goal without a number.
  currentValue: number | null;
  targetValue: number | null;
  unit: string | null;
  // The goal behind the goal rung (K.41), so the number can be bumped there.
  goalId: string | null;
  // How many times the number has been bumped since the quarter began (K.42),
  // read from the kernel audit trail. Optional because only the member's own
  // live ladder carries it: the worked example and the goal chain have no
  // trail of their own.
  bumpsThisQuarter?: number;
  // Where the measure started, so the client can recompute the bar's share of
  // the way after a bump (K.42). Optional for the same reason as the count.
  startValue?: number | null;
  // Which way the number should move (K.78): up by default, down for a goal
  // whose target sits below its start or a key result marked down. Optional
  // because only the goal and key-result rungs carry a number.
  direction?: GoalDirection;
  // What the company key result did since the member's last 1-1 (K.43): the
  // value it stood at then, and how far it has come. Null on every other rung,
  // and null on the key result too when the audit trail holds no value for
  // that window — the rung then shows its number and claims no movement.
  move?: { previous: number; delta: number } | null;
};

// A direction, never a promise (spec 2.1). The Eight Edges tree has no notion
// of a "next step" a member could be shown — objectives and key results are
// company rows, not a progression ladder — so this rung is a static line until
// the org entity exposes one through its door.
const NEXT_RUNG_LABEL = "What comes after this";
const NEXT_RUNG_DETAIL =
  "A direction, never a promise. When this goal lands, the rung above it is the one you and " +
  "your coach name together in a 1-1 — nothing here decides it for you.";

// "3 of 10 deals", or "3 hours, down to 2" for a cut, as the label under the
// bar reads.
export function measureLine(goal: {
  startValue: number | null;
  currentValue: number | null;
  targetValue: number | null;
  metricUnit: string | null;
}): string | null {
  return measureOf({
    current: goal.currentValue,
    target: goal.targetValue,
    unit: goal.metricUnit,
    direction: goalDirection(goal.startValue, goal.targetValue),
  });
}

type ObjectiveRow = { id: string; title: string; quarter: string | null; level: string | null };
type KeyResultRow = {
  id: string;
  title: string;
  objective_id: string | null;
  unit: string | null;
  current_value: number | null;
  target_value: number | null;
  direction: string | null;
};

async function objectiveRung(objectiveId: string): Promise<LadderRung | null> {
  const { data, error } = await selectObjectives("id, title, quarter, level").eq("id", objectiveId).maybeSingle();
  if (error) {
    console.error("[team/coaching/member-ladder] objectives", error);
    return null;
  }
  const o = data as unknown as ObjectiveRow | null;
  if (!o) return null;
  const parts = [o.level, o.quarter].filter(Boolean);
  return {
    kind: "objective",
    label: o.title,
    detail:
      `The company objective this rolls up to${parts.length ? ` (${parts.join(", ")})` : ""}. ` +
      "The whole tree is on Company goals.",
    progressPct: null,
    measure: null,
    currentValue: null,
    targetValue: null,
    unit: null,
    goalId: null,
  };
}

// The rungs above the member's goal, outermost first.
async function companyRungs(ladder: EdgesLadder, sinceISO: string | null): Promise<LadderRung[]> {
  if (ladder.kind === "objective") {
    const rung = await objectiveRung(ladder.id);
    return rung ? [rung] : [];
  }
  const { data, error } = await selectKeyResults("id, title, objective_id, unit, current_value, target_value, direction")
    .eq("id", ladder.id)
    .maybeSingle();
  if (error) {
    console.error("[team/coaching/member-ladder] key_results", error);
    return [];
  }
  const kr = data as unknown as KeyResultRow | null;
  if (!kr) return [];
  // A key result nobody has measured shows no number at all (K.78): its 0 is
  // the column's default, not a reading, and a rung saying "0 of 4.5 score"
  // tells the member the company's CSAT is zero.
  const unmeasured = (await getNeverMeasuredKeyResults([kr])).has(kr.id);
  // From K.43 the key result carries its own numbers, so the rung the member's
  // goal feeds says what the company number is and what it has done since the
  // last 1-1, rather than being a title with a sentence hidden behind it.
  const krRung: LadderRung = {
    kind: "key_result",
    label: kr.title,
    detail:
      kr.target_value === null
        ? "The company key result your goal feeds. It has no number on it yet."
        : unmeasured
          ? `The company key result your goal feeds. Its number is ${NOT_MEASURED_YET}: nobody has checked it in.`
          : // The measure used to be spelled out here; since K.43 the rung shows
          // it in full above the title, so the paragraph says what the rung is
          // for instead of repeating the number.
          `The company key result your goal feeds, measured in ${kr.unit || "its own units"}. ` +
          "The whole tree is on Company goals.",
    progressPct: null,
    // The muted line the rung shows where it has no number.
    measure: unmeasured ? "Not measured yet" : null,
    currentValue: unmeasured ? null : kr.current_value,
    targetValue: kr.target_value,
    unit: kr.unit,
    goalId: null,
    direction: kr.direction === "down" ? "down" : "up",
    move: unmeasured ? null : await getKeyResultMove(kr.id, kr.current_value, sinceISO),
  };
  const above = kr.objective_id ? await objectiveRung(kr.objective_id) : null;
  return above ? [above, krRung] : [krRung];
}

// The ladder for one goal. `guidance` is the coach's words about this member's
// growth — a priority's detail, falling back to the goal's own description —
// because the goal rung is where the member looks for "why this one".
// `sinceISO` is the date of the member's last held 1-1, which is the point the
// company key result's movement is measured from (K.43). It is null before the
// first meeting, and then no movement is claimed at all.
export async function getGoalLadder(
  goal: CoachingGoal,
  guidance: string | null,
  sinceISO: string | null = null,
): Promise<LadderRung[]> {
  const [rungs, bumps] = await Promise.all([
    goal.ladder ? companyRungs(goal.ladder, sinceISO) : Promise.resolve([] as LadderRung[]),
    getGoalBumpsThisQuarter(goal.id),
  ]);
  rungs.push({
    kind: "goal",
    label: goal.title,
    detail: guidance?.trim() || goal.descriptionMarkdown?.trim() || null,
    progressPct: goalProgressPct(goal),
    measure: measureLine(goal),
    currentValue: goal.currentValue,
    targetValue: goal.targetValue,
    unit: goal.metricUnit,
    goalId: goal.id,
    bumpsThisQuarter: bumps,
    startValue: goal.startValue,
    direction: goalDirection(goal.startValue, goal.targetValue),
  });
  rungs.push({
    kind: "next",
    label: NEXT_RUNG_LABEL,
    detail: NEXT_RUNG_DETAIL,
    progressPct: null,
    measure: null,
    currentValue: null,
    targetValue: null,
    unit: null,
    goalId: null,
  });
  return rungs;
}
