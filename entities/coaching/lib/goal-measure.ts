// How a goal's number reads, in words (K.78). Pure and browser-safe, like
// goal-percent.ts beside it, because the goal card, the Today ladder, the
// summary strip, the coach's roster and the company rung all say it, and six
// hand-written copies of "X of Y unit" is how "3 of 2 hours" reached a cut.
//
// A goal goes up by default. A goal whose target sits below where it started
// is a cut ("from 3 hours to 2"), and reads as heading down to the target. A
// company key result carries its direction in its own column instead.

export type GoalDirection = "up" | "down";

// A goal's unit as it sits after a number. A unit that opens with a digit
// ("1 on 1 counts") is set apart in brackets, or it runs into the figure
// before it and "3 of 3 1 on 1 counts" reads as one long number (TH.7.2).
// Null for no unit, so a caller adds nothing.
function unitWords(unit: string | null | undefined): string | null {
  const u = unit?.trim();
  if (!u) return null;
  return /^\d/.test(u) ? `(${u})` : u;
}

// The unit with the space that joins it to the figure before it, or "" for no
// unit: "3" + unitSuffix("1 on 1 counts") reads "3 (1 on 1 counts)".
export function unitSuffix(unit: string | null | undefined): string {
  const words = unitWords(unit);
  return words ? ` ${words}` : "";
}

export function goalDirection(start: number | null, target: number | null): GoalDirection {
  return start !== null && target !== null && target < start ? "down" : "up";
}

// "119 of 200 students", or "3 hours, down to 2" for a cut. Null without both
// numbers: a goal with no target has no measure to state.
export function measureOf(m: {
  current: number | null;
  target: number | null;
  unit: string | null;
  direction: GoalDirection;
}): string | null {
  if (m.current === null) return null;
  const suffix = targetSuffix(m);
  if (suffix === null) return null;
  return m.direction === "down" && !m.unit ? `${m.current}, ${suffix}` : `${m.current} ${suffix}`;
}

// The small text beside a display-size number: "of 200 students", or
// "hours, down to 2" so that "3" and the suffix read as one phrase.
export function targetSuffix(m: { target: number | null; unit: string | null; direction: GoalDirection }): string | null {
  if (m.target === null) return null;
  const unit = unitWords(m.unit);
  if (m.direction === "down") return unit ? `${unit}, down to ${m.target}` : `down to ${m.target}`;
  return `of ${m.target}${unit ? ` ${unit}` : ""}`;
}

// The S line's target, with where the goal started: "target 5 rating, up from
// 4", "target 2 hours, down from 3". The start is what makes the target a
// distance rather than a number, so it is said whenever the goal has one.
export function specificTarget(m: { start: number | null; target: number | null; unit: string | null }): string | null {
  if (m.target === null) return null;
  const unit = unitSuffix(m.unit);
  const head = `target ${m.target}${unit}`;
  if (m.start === null || m.start === m.target) return head;
  return `${head}, ${goalDirection(m.start, m.target)} from ${m.start}`;
}
