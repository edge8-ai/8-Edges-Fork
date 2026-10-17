// How full the goal's bar is. Pure and browser-safe on purpose (K.42): the
// server renders the bar at the value it loaded, and the client recomputes it
// from the number the member just typed so the fill can travel from the old
// share of the way to the new one. One function, two callers, so the two can
// never disagree about what the bar means.

// Progress from start (or 0) to target, clamped. Null whenever there is no
// target or no current value: a goal without a number shows no bar rather than
// an empty one.
export function goalProgressPct(goal: {
  startValue: number | null;
  currentValue: number | null;
  targetValue: number | null;
}): number | null {
  if (goal.targetValue === null || goal.currentValue === null) return null;
  const from = goal.startValue ?? 0;
  const span = goal.targetValue - from;
  if (span === 0) return null;
  return Math.max(0, Math.min(100, Math.round(((goal.currentValue - from) / span) * 100)));
}
