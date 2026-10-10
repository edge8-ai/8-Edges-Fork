import type { LadderRung } from "./member-ladder";

// The worked example a member sees on their first visit (K.27). A first-visit
// page that only asks for a goal leaves the member guessing what a goal here
// looks like, so the "Start with one goal" block is followed by the same
// ascent drawn with three example rungs — the shape of the answer rather than
// a frame asking to be filled.
//
// It is a constant rather than a read: nothing about this member exists yet,
// and a sample built from someone else's goal would put a person's data on a
// page that is not theirs.

// Three rungs, not four: the "next" rung is a direction named in a 1-1, which
// an example cannot stand in for.
export function sampleLadderRungs(): LadderRung[] {
  return [
    {
      kind: "objective",
      label: "The company objective your goal feeds",
      detail:
        "Every goal here hangs off one of the company's objectives, so the work you choose is " +
        "visibly the work the company needs.",
      progressPct: null,
      measure: null,
      currentValue: null,
      targetValue: null,
      unit: null,
      goalId: null,
    },
    {
      kind: "key_result",
      label: "A key result with a number on it",
      detail: "The measure the objective is judged by. Your goal moves this number.",
      progressPct: null,
      measure: null,
      currentValue: null,
      targetValue: null,
      unit: null,
      goalId: null,
    },
    {
      kind: "goal",
      label: "Your goal: one sentence, a number, a date",
      detail:
        "One sentence you would say out loud, a number you can check, and the date you will " +
        "check it on. That is the whole goal.",
      progressPct: null,
      measure: null,
      currentValue: null,
      targetValue: null,
      unit: null,
      goalId: null,
    },
  ];
}
