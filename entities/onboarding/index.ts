// The onboarding module's door (ME-11): the new-hire submission handler, the
// daily onboarding cycle (journeys, plans, the Day 8 survey, probation) and
// the cycle board the admin talent screen renders. Siblings reach it only
// through this file.
export * from "./lib/cycle";
export * from "./lib/probation-decision";
export * from "./lib/data";
// Client component; see the note in ../coaching/index.ts.
export * from "./ui/OnboardingCycleBoard";
// Cross-entity reads and writes of this entity's tables (design §4).
export * from "./lib/reads";
export * from "./lib/writes";
// What the composition root registers when this entity is installed: the hire
// that opens a new starter's journey (S.2).
export { subscriptions } from "./lib/subscriptions";
