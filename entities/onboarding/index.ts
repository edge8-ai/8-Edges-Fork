// The onboarding module's door (ME-11): the new-hire submission handler, the
// daily onboarding cycle (journeys, plans, the Day 8 survey, probation) and
// the cycle board the admin talent screen renders. Siblings reach it only
// through this file.
export * from "./lib/cycle";
export * from "./lib/probation-decision";
export * from "./lib/data";
// Client component; see the note in ../coaching/index.ts.
export * from "./ui/OnboardingCycleBoard";
// What other entities ask of onboarding plans and git addresses, and the
// writes they make (A.70, ADR 0018). The raw writer in lib/writes.ts is
// private to this entity; lib/reads.ts, whose builders only other entities
// called, is gone.
export * from "./lib/plan-progress";
export * from "./lib/git-emails";
// What the composition root registers when this entity is installed: the hire
// that opens a new starter's journey (S.2).
export { subscriptions } from "./lib/subscriptions";
