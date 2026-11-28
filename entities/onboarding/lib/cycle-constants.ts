// The two addresses/slugs both ./cycle and ./milestones need. They live here so
// the milestones can reach them without importing ./cycle, which would make the
// dependency between the driver and its rules circular.

// The talent director is org's, beside Talent (ADR 0025); onboarding writes to them.
export { TALENT_DIRECTOR_EMAIL } from "@/entities/org";
export const DAY8_SURVEY_SLUG = "onboarding-day-8-feedback";
