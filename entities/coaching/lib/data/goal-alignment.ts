import { selectKeyResults } from "@/entities/org";
import { measureOf } from "../goal-measure";
import type { CoachingGoal } from "../types";
import { NOT_MEASURED_YET, getNeverMeasuredKeyResults } from "./key-result-measured";

// The A in FAST, with a number on it (K.62). A goal's card says which company
// key result it lifts, and — when that key result carries its own measure —
// where the company number stands. Without the number the line is a title, and
// a member has no way to tell whether the thing their goal pulls has moved.
//
// The Eight Edges tree belongs to the org entity, so it is read through the org
// door rather than by naming its tables (CLAUDE.md rule 4), exactly as
// member-ladder.ts reads the rung above the goal.
//
// One read for the whole tab: a card per goal would otherwise be a query per
// card. A read error yields an empty map, and the alignment line then shows
// only the label the goal already carries — what it showed before K.62.
type KeyResultRow = {
  id: string;
  unit: string | null;
  current_value: number | null;
  target_value: number | null;
  direction: string | null;
};

export async function getGoalAlignmentMeasures(
  goals: Pick<CoachingGoal, "ladder">[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = Array.from(
    new Set(
      goals
        .map((g) => (g.ladder?.kind === "key_result" ? g.ladder.id : null))
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (ids.length === 0) return out;
  const { data, error } = await selectKeyResults("id, unit, current_value, target_value, direction").in("id", ids);
  if (error) {
    console.error("[team/coaching/goal-alignment] key_results", error);
    return out;
  }
  const rows = (data ?? []) as unknown as KeyResultRow[];
  // A company number nobody has measured says so (K.78), rather than reading
  // as a measured zero under every goal that lifts it.
  const unmeasured = await getNeverMeasuredKeyResults(rows);
  for (const kr of rows) {
    if (kr.current_value === null || kr.target_value === null) continue;
    const line = unmeasured.has(kr.id)
      ? NOT_MEASURED_YET
      : measureOf({
          current: kr.current_value,
          target: kr.target_value,
          unit: kr.unit,
          direction: kr.direction === "down" ? "down" : "up",
        });
    if (line) out.set(kr.id, line);
  }
  return out;
}
