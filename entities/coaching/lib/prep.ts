// The ten-bullet prep (K.4, docs/plans/2026-09-16-coaching-1on1-improvement-plan.md
// section 4.1). The model writes one flat list of bullets, ordered by what
// matters most in the room; a bullet it prefixes "[coach]" is for the coach
// alone. This module turns that text into the two stored copies and enforces
// the cap in code, so an over-long reply never reaches a coach's phone.

export const MAX_PREP_BULLETS = 10;
const COACH_TAG = /^\[coach\]\s*/i;
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+(.*\S)\s*$/;

export type ShapedPrep = { coach: string; member: string };

export function shapePrep(markdown: string): ShapedPrep {
  const coach: string[] = [];
  const member: string[] = [];
  for (const line of markdown.split("\n")) {
    const m = BULLET.exec(line);
    if (!m) continue;
    if (coach.length >= MAX_PREP_BULLETS) break;
    const text = m[1];
    const coachOnly = COACH_TAG.test(text);
    coach.push(`- ${text.replace(COACH_TAG, "")}`);
    if (!coachOnly) member.push(`- ${text}`);
  }
  return { coach: coach.join("\n"), member: member.join("\n") };
}
