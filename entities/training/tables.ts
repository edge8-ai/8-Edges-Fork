// The Supabase tables the training entity owns (TR.2, reviews TR.3, plans TR.5, the English Program's
// exercises, session blocks, notes, homework and weekly recaps). Nobody
// else writes them. Certification progress is not here: the sync mirrors it
// onto people.metadata, which the kernel's identity writer owns.
export const TRAINING_TABLES: readonly string[] = ["training_assignments", "training_attendance", "training_exercises", "training_learner_feedback", "training_learner_notes", "training_plan_members", "training_plans", "training_reviews", "training_session_blocks", "training_submissions", "training_types", "training_weekly_recaps", "trainings"];
