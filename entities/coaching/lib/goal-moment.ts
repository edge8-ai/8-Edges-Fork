// The moment a goal moves (K.41). When the news comes in, the member opens
// the page and bumps the number right where the goal lives; this is the line
// the page says back. About the goal and its target, never a rank, never a
// comparison with anyone else, and never a scold when the number goes down.

export type GoalMoment = { headline: string; detail: string; tone: "up" | "flat" | "down" | "landed" | "halfway" };

// The share of the way from the start to the target, unclamped, or null with no
// target. Measured from the start rather than from zero, because the bar is
// (goal-percent.ts): on 2026-10-06 a goal from 4 to 5 stars bumped to 4.2 said
// "84% of the way" over a bar standing at 20%. The span's sign carries the
// direction, so a cut — from 3 hours to 2 — counts coming down as progress.
function shareOfWay(value: number, start: number, target: number | null): number | null {
  if (target === null || target === start) return null;
  return (value - start) / (target - start);
}

// A goal has exactly two moments (Khoa, 2026-09-17): half the way and the whole
// way. Half is the one this rule has to find, because unlike the target it is
// not a number anyone typed — it is a line the bump crossed. It is a crossing,
// not a state: the bump that takes 90 to 110 of 200 says "Halfway", and every
// later bump above the line says only what it moved, because a milestone that
// repeats is a tally and a tally about someone's own goal is a nag.
function crossedHalf(before: number | null, after: number | null): boolean {
  return before !== null && after !== null && before < 0.5 && after >= 0.5;
}

export function goalMoment(input: {
  before: number | null;
  after: number;
  // Where the goal started, or null for a goal counted from zero.
  start?: number | null;
  target: number | null;
  unit: string | null;
}): GoalMoment {
  const unit = input.unit ? ` ${input.unit}` : "";
  const before = input.before ?? 0;
  const start = input.start ?? 0;
  const target = input.target;
  const shareBefore = shareOfWay(before, start, target);
  const shareAfter = shareOfWay(input.after, start, target);
  // Which way is forward: down for a cut, up otherwise, and up for a goal with
  // no target, which has no other way to say what better means.
  const forward = target !== null && target < start ? -1 : 1;
  const moved = (input.after - before) * forward;
  const pct = shareAfter === null ? null : Math.round(shareAfter * 100);
  if (shareAfter !== null && shareAfter >= 1) {
    return {
      headline: `${num(input.after)}${unit}. That is the goal.`,
      detail: "Landed. Say it in your next 1-1, then pick what comes after this.",
      tone: "landed",
    };
  }
  if (moved > 0 && crossedHalf(shareBefore, shareAfter)) {
    return {
      // "2.5 of 2 hours" says nothing about a cut, so a cut names where it is headed.
      headline:
        forward > 0
          ? `Halfway. ${num(input.after)} of ${num(target!)}${unit}.`
          : `Halfway. ${num(input.after)}${unit}, on the way to ${num(target!)}.`,
      detail: `${pct}% of the way, from where you started. ${remaining(target! - input.after, input.unit)}`,
      tone: "halfway",
    };
  }
  if (moved > 0) {
    return {
      headline: `${num(before)} → ${num(input.after)}${unit}`,
      detail: pct !== null ? `${pct}% of the way. ${remaining(target! - input.after, input.unit)}` : "Moving.",
      tone: "up",
    };
  }
  if (moved < 0) {
    return {
      headline: `${num(before)} → ${num(input.after)}${unit}`,
      detail: "Numbers move both ways. Worth a line in your next 1-1 about what changed.",
      tone: "down",
    };
  }
  return { headline: `Still ${num(input.after)}${unit}`, detail: "No change is a fact too.", tone: "flat" };
}

// A number as a person would write it. Goal values are decimals typed by hand
// (4.2 stars, 2.5 hours), and binary floats cannot hold most of them, so 5 - 4.2
// is 0.7999999999999998; rounding to six places gives back the 0.8 anyone
// typing those two numbers meant.
function num(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}

function remaining(n: number, unit: string | null): string {
  return `${num(Math.abs(n))}${unit ? ` ${unit}` : ""} to go.`;
}
