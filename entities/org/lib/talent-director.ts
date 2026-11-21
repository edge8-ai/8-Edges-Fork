import { OPS_EMAIL } from "@/kernel/config/contacts";

// Who directs Talent: copied on every onboarding milestone, sent each probation
// decision, and allowed to ask for review links for anyone. It lives with Talent
// in org since performance reviews moved here (ADR 0025; Khoa, 2026-11-01), so the
// review-link rule reads it without org importing onboarding, which requires org.
export const TALENT_DIRECTOR_EMAIL = OPS_EMAIL;
