// A team member's career level (team_members.career_level, HR.1). The list is
// the column's check constraint from 20260812150000_performance_reviews_cycles,
// so a value outside it would be refused by the database anyway; the drawer
// offers exactly these four and the action checks them before writing.
//
// This module has no server dependency: the Team drawer is a client component
// and shows the review expectation under the level it is about to set.
export const CAREER_LEVELS = ["junior", "collaborator", "senior", "principal"] as const;
type CareerLevel = (typeof CAREER_LEVELS)[number];

export function isCareerLevel(value: string): value is CareerLevel {
  return (CAREER_LEVELS as readonly string[]).includes(value);
}

// Expected AI-craft rating per career level (the mint marker in the review
// runner). Same four levels on both tracks; principal expectation is 4 with 5
// as the stretch, so the marker sits at 4.
//
// `satisfies` makes the type check fail when this map and CAREER_LEVELS drift
// apart, a level missing or one too many. The declared type stays keyed by
// string because the review and coaching callers look a level up with the
// plain string they read from the database.
export const LEVEL_EXPECTATION: Readonly<Record<string, number>> = {
  junior: 2,
  collaborator: 3,
  senior: 4,
  principal: 4,
} satisfies Record<CareerLevel, number>;
