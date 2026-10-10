import { OPS_EMAIL } from "@/kernel/config/contacts";
// The two addresses/slugs both ./cycle and ./milestones need. They live here so
// the milestones can reach them without importing ./cycle, which would make the
// dependency between the driver and its rules circular.

export const TALENT_DIRECTOR_EMAIL = OPS_EMAIL;
export const DAY8_SURVEY_SLUG = "onboarding-day-8-feedback";
